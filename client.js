"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mtcp_1 = require("./mtcp");
const pipeServer_1 = require("./pipeServer");
let upstream_host = "8.8.8.8"; //远端ip()

// upstream_host = [//多线聚合模式
//     "0,0,0,0",
//     "1,1,1,1"
// ];
let upstream_port = 15201; //远端mtcp端口
let lisent_port = 5201; //本地监听端口
//配置tcp连接个数(每个tcp连接单独一个池子)
mtcp_1.MSocket.PoolCount = 3; //默认为3 (根据带宽选择 不建议超过5)(多线聚合时忽略了这个参数)
let preLinkCount = 10; //预连接池
(0, pipeServer_1.createPipeServer)(upstream_port, upstream_host, pipeServer_1.PipeType.tcp2mtcp, lisent_port, mtcp_1.MSocket.PoolCount, preLinkCount);
