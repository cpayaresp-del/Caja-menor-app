"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.servirFrontend = servirFrontend;
const express_1 = __importDefault(require("express"));
const node_path_1 = __importDefault(require("node:path"));
function servirFrontend(ruta) {
    const router = express_1.default.Router();
    if (!ruta)
        return router;
    const directorio = node_path_1.default.resolve(ruta);
    router.use(express_1.default.static(directorio, {
        setHeaders(res, archivo) {
            if (archivo.endsWith('index.html'))
                res.setHeader('Cache-Control', 'no-cache');
            else if (/\.[a-f0-9]{8,}\./i.test(node_path_1.default.basename(archivo)))
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }));
    router.use((req, res, next) => {
        if (req.method !== 'GET') {
            next();
            return;
        }
        res.sendFile(node_path_1.default.join(directorio, 'index.html'), (error) => { if (error)
            next(error); });
    });
    return router;
}
