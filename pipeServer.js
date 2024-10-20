"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipeType = void 0;
exports.createPipeServer = createPipeServer;
const net_1 = require("net");
const mtcp_1 = require("./mtcp");
var PipeType;
(function (PipeType) {
    PipeType[PipeType["tcp2mtcp"] = 0] = "tcp2mtcp";
    PipeType[PipeType["mtcp2tcp"] = 1] = "mtcp2tcp";
})(PipeType || (exports.PipeType = PipeType = {}));
function createPipeServer(upstream_port, upstream_host, pipe_type = PipeType.tcp2mtcp, lisent_port, poolCount = 4) {
    let createServerFn = pipe_type == PipeType.tcp2mtcp ? net_1.createServer : mtcp_1.createMTcpServer;
    let connectFn = pipe_type == PipeType.tcp2mtcp ? mtcp_1.connectMTcp : net_1.connect;
    let server = createServerFn(function (conn) {
        if (pipe_type === PipeType.tcp2mtcp)
            mtcp_1.MSocket.PoolCount = poolCount;
        let up_socket = connectFn({ port: upstream_port, host: upstream_host }, function () {
            up_socket.pipe(conn, { end: true });
            conn.pipe(up_socket, { end: true });
        });
        const destroy = () => {
            up_socket.destroySoon();
            conn.destroySoon();
        };
        conn.on('error', destroy);
        up_socket.on('error', destroy);
        conn.on('close', destroy);
        up_socket.on('close', destroy);
    });
    if (lisent_port) {
        server.listen(lisent_port, () => {
            console.log(`启动成功:listen ${pipe_type === PipeType.mtcp2tcp ? "mtcp" : "tcp"}:${lisent_port} -> ${pipe_type === PipeType.mtcp2tcp ? "tcp" : "mtcp"}:${upstream_host}:${upstream_port}`);
        });
        server.on("error", (err) => {
            console.log(`启动失败:listen:${lisent_port} -> ${upstream_host}:${upstream_port} err:${err.message}`);
        });
    }
    return server;
}
