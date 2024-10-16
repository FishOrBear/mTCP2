"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MSocket = void 0;
exports.createMTcpServer = createMTcpServer;
exports.connectMTcp = connectMTcp;
const net_1 = require("net");
const stream_1 = require("stream");
const HEADER_LENGTH = 4;
var PackageIndex;
(function (PackageIndex) {
    PackageIndex[PackageIndex["length"] = 0] = "length";
    PackageIndex[PackageIndex["pid"] = 2] = "pid";
})(PackageIndex || (PackageIndex = {}));
class MSocket extends stream_1.Duplex {
    static PoolCount = 4;
    cid;
    poolCount = MSocket.PoolCount;
    conns = [];
    pendingConns = [];
    readyState = "opening";
    bytesRead = 0;
    writableLength = 0;
    bytesWritten = 0;
    remoteAddress = "";
    remotePort;
    keepAlive = false;
    keepAliveDelay = 0;
    noDelay = false;
    constructor(opts) {
        super({
            highWaterMark: 1,
            allowHalfOpen: false, //和net.socket差不多
            ...opts,
        });
    }
    setKeepAlive(enable = false, initialDelay = 0) {
        this.keepAlive = enable;
        this.keepAliveDelay = initialDelay;
        for (let conn of this.conns)
            conn.setKeepAlive(this.keepAlive, this.keepAliveDelay);
        return this;
    }
    setNoDelay(noDelay = true) {
        this.conns.forEach(conn => conn.setNoDelay(noDelay));
        this.noDelay = noDelay;
        return this;
    }
    //检查Alive,当所有的连接都被关闭时,加入end包,触发end事件
    checkAlive() {
        if (this.destroyed)
            return;
        if (this.conns.length)
            return;
        if (this.readableEnded)
            return;
        function closeConn(conn) {
            conn.removeAllListeners("data");
            conn.destroySoon();
        }
        this.pendingConns.forEach(closeConn);
        this.pendingConns.length = 0;
        //标记结束包(fin包)(标记可读的下一个包为end)
        let nextPid = this.readPid;
        while (this.packages[nextPid]) {
            nextPid++;
            if (nextPid === 65536)
                nextPid = 0;
        }
        this.packages[nextPid] = null;
        this._read(0);
    }
    destroySoon() {
        this.destroy();
    }
    destroy(error) {
        for (let conn of this.conns)
            conn.destroySoon();
        for (let conn of this.pendingConns)
            conn.destroySoon();
        this.readyState = "closed";
        return super.destroy(error);
    }
    connect(port, host, connectionListener) {
        for (let i = 0; i < this.poolCount; i++)
            this.connectSub(port, host, connectionListener);
        return this;
    }
    //连接子流
    connectSub(port, host, connectionListener) {
        //写入自己的id和主id
        const writeid = (conn) => {
            let buffer = Buffer.alloc(4);
            buffer.writeUint16BE(conn.cid + 100);
            buffer.writeUint16BE(this.cid, 2);
            conn.write(buffer, err => {
                if (err)
                    console.error("login err:", err.message);
                else {
                    if (this.readyState === "opening") {
                        this.readyState = "open";
                        this.emit("connect");
                        if (connectionListener)
                            connectionListener();
                    }
                }
            });
        };
        let conn = (0, net_1.connect)(port, host);
        this.pendingConns.push(conn);
        conn.setKeepAlive(true, 10000);
        conn.setNoDelay(true);
        conn.on("error", err => {
            if (this.readyState === "open" || this.readyState === "opening")
                console.error(`mtcp conn(cid:${conn.cid},mid:${this.cid}:${port}) link error:${err.message} w:${conn.bytesWritten} r:${conn.bytesRead}`);
        });
        conn.once("data", (buffer) => {
            if (!conn.cid) //未登录
             {
                conn.cid = buffer.readUint16BE(0);
                if (!this.cid)
                    this.cid = conn.cid; //初始化up_cid
                writeid(conn); //写入id 登录
                conn.leftBuffer = buffer.subarray(2);
                this.pendingConns.splice(this.pendingConns.indexOf(conn), 1);
                this.addSocket(conn);
            }
        });
        return this;
    }
    //连接成功的conn进入这里,接管data end close
    //未连接的在pendingConns中
    addSocket(conn) {
        const read = () => {
            while (conn.leftBuffer.length >= HEADER_LENGTH) {
                let length = conn.leftBuffer.readUint16BE(PackageIndex.length) + 1;
                let end = length + HEADER_LENGTH;
                if (conn.leftBuffer.length < end)
                    break;
                let pid = conn.leftBuffer.readUint16BE(PackageIndex.pid);
                // console.log('pid: ', pid);
                this.packages[pid] = conn.leftBuffer.subarray(HEADER_LENGTH, end);
                this._read(0);
                conn.leftBuffer = conn.leftBuffer.subarray(end);
            }
        };
        conn.on("data", buffer => {
            conn.leftBuffer = Buffer.concat([conn.leftBuffer, buffer]);
            read();
        });
        if (conn.leftBuffer?.length)
            read();
        const OnClose = () => {
            if (conn.deleted)
                return;
            this.conns.splice(this.conns.indexOf(conn), 1);
            conn.deleted = true;
            this.checkAlive(); //检查可用性
        };
        conn.on("end", () => {
            OnClose();
        });
        conn.on("close", () => {
            OnClose();
        });
        conn.on("drain", () => {
            conn.full = false;
            this.emit("drain");
        });
        this.conns.push(conn);
        conn.setKeepAlive(this.keepAlive, this.keepAliveDelay);
        conn.setNoDelay(this.noDelay);
    }
    pause() {
        for (let conn of this.conns)
            conn.pause();
        return super.pause();
    }
    resume() {
        for (let conn of this.conns)
            conn.resume();
        return super.resume();
    }
    //#region 读包与发包索引
    packages = [];
    readPid = 0;
    writePid = 0;
    get pid() {
        let pid = this.writePid;
        this.writePid++;
        if (this.writePid === 65536)
            this.writePid = 0;
        return pid;
    }
    //#endregion
    _read(size) {
        while (true) {
            let pkg = this.packages[this.readPid];
            if (pkg === undefined)
                return;
            this.push(pkg);
            if (pkg)
                this.bytesRead += pkg.length;
            else
                return;
            delete this.packages[this.readPid];
            this.readPid++;
            if (this.readPid === 65536)
                this.readPid = 0;
        }
    }
    //写入流:写完了
    end(...args) {
        if (this.readyState !== "closed")
            this.readyState = "readOnly";
        // if (args.length === 2 || args.length === 3) console.log(args);
        for (let conn of this.conns)
            conn.end();
        for (let conn of this.pendingConns)
            conn.end();
        // this.destroy(); 不需要destroy 因为end后 这个连接会从连接池移除. 所有的连接都结束后,自然会销毁
        return super.end(...args);
    }
    _write(buffer, encoding, callback) {
        if (this.conns.length === 0) {
            this.emit("error", new Error("conns 0"));
            return;
        }
        if (this.readyState !== "open") {
            this.emit("error", new Error("not open"));
            return;
        }
        //创建一个打包后的buffer数据
        function makePackageBuffer(pid, data) {
            const dataLength = data.length;
            const buffer = Buffer.alloc(HEADER_LENGTH + dataLength);
            buffer.writeUint16BE(pid, PackageIndex.pid);
            buffer.writeUint16BE(dataLength - 1, PackageIndex.length);
            data.copy(buffer, HEADER_LENGTH);
            return buffer;
        }
        while (buffer.length > 65536) {
            this.writeBufferPack(makePackageBuffer(this.pid, buffer.subarray(0, 65536)));
            buffer = buffer.subarray(65536);
        }
        if (buffer.length)
            this.writeBufferPack(makePackageBuffer(this.pid, buffer));
        if (this.conns.some(conn => !conn.full))
            callback();
        else
            this.once("drain", callback);
    }
    _final(callback) {
        callback();
    }
    _writeConnIndex = 0;
    writeBufferPack(buffer, retryCount = 0) {
        if (this.destroyed)
            return;
        if (this.conns.length === 0) {
            this.emit("error", new Error("writeBufferPack conn0"));
            return;
        }
        if (this._writeConnIndex >= this.conns.length)
            this._writeConnIndex = 0;
        let conn = this.conns[this._writeConnIndex];
        if (conn.full) //选择合理的连接
         {
            this._writeConnIndex++;
            if (this._writeConnIndex >= this.conns.length)
                this._writeConnIndex = 0;
            conn = this.conns[this._writeConnIndex];
        }
        let sendOk = conn.write(buffer, err => {
            if (err) {
                console.log("write err:", err.message);
                if (retryCount < 2)
                    this.writeBufferPack(buffer, ++retryCount); //重试
                else
                    this.destroy();
            }
            else
                this.writableLength -= buffer.length; //计算写入数量
        });
        this.writableLength += buffer.length; //计算写入数量
        if (!sendOk)
            conn.full = true;
    }
}
exports.MSocket = MSocket;
function createMTcpServer(connectionListener) {
    let cid_index = 1;
    let msocketMap = new Map();
    return (0, net_1.createServer)((conn) => {
        while (msocketMap.has(cid_index)) {
            cid_index++;
            if (cid_index === 65000)
                cid_index = 1;
        }
        conn.cid = cid_index++;
        conn.on("error", (err) => {
            console.log(`error:mid:${conn.mid} cid:${conn.cid} ${err.message}`);
        });
        let buffer = Buffer.alloc(2);
        buffer.writeUint16BE(conn.cid);
        conn.write(buffer, err => {
            if (err)
                console.log(`login write error cid:${conn.cid} ${err.message}`);
        });
        conn.once("data", buffer => {
            if (buffer.length < 4) {
                conn.end();
                return;
            }
            let id = buffer.readUint16BE();
            if (id !== conn.cid + 100) {
                conn.end();
                return;
            }
            conn.leftBuffer = buffer.subarray(4);
            let mid = buffer.readUint16BE(2);
            conn.mid = mid;
            let ms = msocketMap.get(mid);
            if (!ms) {
                ms = new MSocket();
                msocketMap.set(mid, ms);
                ms.addSocket(conn); //必须提前给它(因为连接成功后 就可以用了 就要发送数据了)
                ms.readyState = "open";
                if (connectionListener)
                    connectionListener(ms);
                ms.on("close", () => {
                    msocketMap.delete(mid);
                    // console.log(`close ms mid:${mid},rem:${msocketMap.size}`);
                });
            }
            else {
                if (ms.readyState === "open" || ms.readyState === "opening")
                    ms.addSocket(conn);
                else
                    console.log("状态错误!", ms.readyState);
            }
        });
    });
}
function connectMTcp(obj, cb) {
    return new MSocket().connect(obj.port, obj.host, cb);
}
