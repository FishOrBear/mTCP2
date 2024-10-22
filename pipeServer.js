"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipeType = void 0;
exports.createPipeServer = createPipeServer;
const net_1 = require("net");
const mtcp_1 = require("./mtcp");
var PipeType;
(function (PipeType)
{
    PipeType[PipeType["tcp2mtcp"] = 0] = "tcp2mtcp";
    PipeType[PipeType["mtcp2tcp"] = 1] = "mtcp2tcp";
})(PipeType || (exports.PipeType = PipeType = {}));
function createPipeServer(upstream_port, upstream_host, pipe_type = PipeType.tcp2mtcp, lisent_port, poolCount = 2, //每个连接的子流个数
    preLinkCount = 0)
{
    let createServerFn = pipe_type == PipeType.tcp2mtcp ? net_1.createServer : mtcp_1.createMTcpServer;
    let connectFn = pipe_type == PipeType.tcp2mtcp ? mtcp_1.connectMTcp : net_1.connect;
    let preConnPool = []; //预连接池
    //预连接
    const PreConnect = () =>
    {
        let conn = connectFn({ port: upstream_port, host: upstream_host }, function ()
        {
            preConnPool.push(conn);
            const remove = () =>
            {
                let index = preConnPool.indexOf(conn);
                if (index !== -1) {
                    preConnPool.splice(index, 1);
                    PreConnect();
                }
            };
            conn.on("close", remove);
            conn.on('error', () =>
            {
                remove();
                conn.destroy();
            });
        });
    };
    if (pipe_type === PipeType.mtcp2tcp && preLinkCount > 0) {
        for (let i = 0; i < preLinkCount; i++)
            setTimeout(PreConnect, i * 500);
        //每3s新建连接
        setInterval(() =>
        {
            if (preConnPool.length === preLinkCount) {
                preConnPool.shift();
                PreConnect();
            }
        }, 3000);
    }
    let server = createServerFn(function (conn)
    {
        if (pipe_type === PipeType.tcp2mtcp)
            mtcp_1.MSocket.PoolCount = poolCount;
        let up_socket;
        if (preConnPool.length) {
            up_socket = preConnPool.shift();
            up_socket.removeAllListeners("close");
            up_socket.removeAllListeners("error");
            up_socket.pipe(conn, { end: true });
            conn.pipe(up_socket, { end: true });
        }
        else
            up_socket = connectFn({ port: upstream_port, host: upstream_host }, function ()
            {
                up_socket.pipe(conn, { end: true });
                conn.pipe(up_socket, { end: true });
            });
        const destroy = () =>
        {
            up_socket.destroySoon();
            conn.destroySoon();
        };
        conn.on('error', destroy);
        up_socket.on('error', destroy);
        conn.on('close', destroy);
        up_socket.on('close', destroy);
    });
    if (lisent_port) {
        server.listen(lisent_port, () =>
        {
            console.log(`启动成功:listen ${pipe_type === PipeType.mtcp2tcp ? "mtcp" : "tcp"}:${lisent_port} -> ${pipe_type === PipeType.mtcp2tcp ? "tcp" : "mtcp"}:${upstream_host}:${upstream_port}`);
        });
        server.on("error", (err) =>
        {
            console.log(`启动失败:listen:${lisent_port} -> ${upstream_host}:${upstream_port} err:${err.message}`);
        });
    }
    return server;
}
