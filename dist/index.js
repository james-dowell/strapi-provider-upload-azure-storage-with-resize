"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const identity_1 = require("@azure/identity");
const storage_blob_1 = require("@azure/storage-blob");
const sharp_1 = __importDefault(require("sharp"));
const stream_1 = require("stream");
function trimParam(input) {
    return typeof input === 'string' ? input.trim() : '';
}
function getServiceBaseUrl(config) {
    return (trimParam(config.serviceBaseURL) ||
        `https://${trimParam(config.account)}.blob.core.windows.net`);
}
function getFileName(path, file) {
    return `${trimParam(path)}/${file.hash}${file.ext}`;
}
function makeBlobServiceClient(config) {
    const serviceBaseURL = getServiceBaseUrl(config);
    switch (config.authType) {
        case 'default': {
            const account = trimParam(config.account);
            const accountKey = trimParam(config.accountKey);
            const sasToken = trimParam(config.sasToken);
            if (sasToken != '') {
                const anonymousCredential = new storage_blob_1.AnonymousCredential();
                return new storage_blob_1.BlobServiceClient(`${serviceBaseURL}${sasToken}`, anonymousCredential);
            }
            const sharedKeyCredential = new storage_blob_1.StorageSharedKeyCredential(account, accountKey);
            const pipeline = (0, storage_blob_1.newPipeline)(sharedKeyCredential);
            return new storage_blob_1.BlobServiceClient(serviceBaseURL, pipeline);
        }
        case 'msi': {
            const clientId = trimParam(config.clientId);
            if (clientId != null && clientId != '') {
                return new storage_blob_1.BlobServiceClient(serviceBaseURL, new identity_1.DefaultAzureCredential({ managedIdentityClientId: clientId }));
            }
            return new storage_blob_1.BlobServiceClient(serviceBaseURL, new identity_1.DefaultAzureCredential());
        }
        default: {
            const exhaustiveCheck = config;
            throw new Error(exhaustiveCheck);
        }
    }
}
const uploadOptions = {
    bufferSize: 4 * 1024 * 1024,
    maxBuffers: 20,
};
function handleUpload(config, blobSvcClient, file) {
    return __awaiter(this, void 0, void 0, function* () {
        const serviceBaseURL = getServiceBaseUrl(config);
        const containerClient = blobSvcClient.getContainerClient(trimParam(config.containerName));
        const client = containerClient.getBlockBlobClient(getFileName(config.defaultPath, file));
        if (trimParam(config === null || config === void 0 ? void 0 : config.createContainerIfNotExist) === 'true') {
            if (trimParam(config === null || config === void 0 ? void 0 : config.publicAccessType) === 'container' ||
                trimParam(config === null || config === void 0 ? void 0 : config.publicAccessType) === 'blob') {
                yield containerClient.createIfNotExists({ access: config.publicAccessType });
            }
            else {
                yield containerClient.createIfNotExists();
            }
        }
        const options = {
            blobHTTPHeaders: {
                blobContentType: file.mime,
                blobCacheControl: trimParam(config.defaultCacheControl),
            },
        };
        const cdnBaseURL = trimParam(config.cdnBaseURL);
        file.url = cdnBaseURL ? client.url.replace(serviceBaseURL, cdnBaseURL) : client.url;
        if (file.url.includes(`/${config.containerName}/`) &&
            config.removeCN &&
            config.removeCN == 'true') {
            file.url = file.url.replace(`/${config.containerName}/`, '/');
        }
        const transformer = (0, sharp_1.default)().resize({ width: 1100, withoutEnlargement: true });
        file.stream.pipe(transformer);
        const buffer = yield transformer.toBuffer();
        const upload = stream_1.Readable.from(buffer);
        yield client.uploadStream(upload, uploadOptions.bufferSize, uploadOptions.maxBuffers, options);
    });
}
function handleDelete(config, blobSvcClient, file) {
    return __awaiter(this, void 0, void 0, function* () {
        const containerClient = blobSvcClient.getContainerClient(trimParam(config.containerName));
        const client = containerClient.getBlobClient(getFileName(config.defaultPath, file));
        yield client.delete();
        file.url = client.url;
    });
}
module.exports = {
    provider: 'azure',
    auth: {
        authType: {
            label: 'Authentication type (required, either "msi" or "default")',
            type: 'text',
        },
        clientId: {
            label: 'Azure Identity ClientId (consumed if authType is "msi" and passed as DefaultAzureCredential({ managedIdentityClientId: clientId }))',
            type: 'text',
        },
        account: {
            label: 'Account name (required)',
            type: 'text',
        },
        accountKey: {
            label: 'Secret access key (required if authType is "default")',
            type: 'text',
        },
        serviceBaseURL: {
            label: 'Base service URL to be used, optional. Defaults to https://${account}.blob.core.windows.net (optional)',
            type: 'text',
        },
        containerName: {
            label: 'Container name (required)',
            type: 'text',
        },
        createContainerIfNotExist: {
            label: 'Create container on upload if it does not (optional)',
            type: 'text',
        },
        publicAccessType: {
            label: 'If createContainerIfNotExist is true, set the public access type to one of "blob" or "container" (optional)',
            type: 'text',
        },
        cdnBaseURL: {
            label: 'CDN base url (optional)',
            type: 'text',
        },
        defaultCacheControl: {
            label: 'Default cache-control setting for all uploaded files',
            type: 'text',
        },
        removeCN: {
            label: 'Remove container name from URL (optional)',
            type: 'text',
        },
    },
    init: (config) => {
        const blobSvcClient = makeBlobServiceClient(config);
        return {
            upload(file) {
                return handleUpload(config, blobSvcClient, file);
            },
            uploadStream(file) {
                return handleUpload(config, blobSvcClient, file);
            },
            delete(file) {
                return handleDelete(config, blobSvcClient, file);
            },
        };
    },
};
