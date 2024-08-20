"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pipeServer_1 = require("./pipeServer");
let upstream_host = "0.0.0.0";
let upstream_port = 5201; //本机反向代理端口
let lisent_port = 15201;
(0, pipeServer_1.createPipeServer)(upstream_port, upstream_host, pipeServer_1.PipeType.mtcp2tcp, lisent_port);
