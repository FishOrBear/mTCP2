# 概述
mTCP 将多个tcp连接聚合成一个tcp连接,从而提高单tcp的速度.(在某些网络环境下有用,例如单tcp连接被qos,而远端的服务端没有qos,则可以使用).

# 原理
```
                        .---- 桥 1 ----.
                       /                \
 服务器 A  --- mpclient -------桥 2 ------ mpserver --- 服务器 B
                       \                /
                        `---- 桥 3 ----`


ref:https://github.com/greensea/mptunnel/blob/master/README.zh_CN.md
```

# 使用场景
你必须要有一个服务器,然后你到那个服务器的速度单tcp有限制,但是那个服务器的单tcp没有限制.

# 为什么写这个
现有的要么不能满足我的需求,要么部署太麻烦了.

# 特点
1. 代码简单,核心mTCP.js代码包含注释只有300多行.
2. 使用双工流实现了背压,合理控制了内存,并且连接能正常回收,不会内存泄漏.
3. mtcp内部自己接管连接池,不需要外部库,没有node_modules,不需要 `npm i`
4. mtcp可以独立作为外部库使用,使用起来就和net.Socket一样.
5. 因为增强了单线程的速度,所以在多线程tcp下,可能因为竞争关系,多线程的性能可能有略微下降.
6. 如果连接因为网络问题被关闭,那么会自动使用另一个流.
7. 可以使用多个出口地址(或者入口地址),实现多宽带聚合(或者备份).
8. 可以简单修改代码,实现上下行流量分离,端口分离.


# 使用
1. 服务端(请编辑remote.js修改你的配置端口)
```bash
node remote.js
```

2. 客户端(请编辑client.js修改你的配置端口)
```bash
node client.js
```

# 常见问题
1. 使用jemalloc避免nodejs内存碎片
```
apt-get install -y libjemalloc-dev
RUN echo "/usr/lib/x86_64-linux-gnu/libjemalloc.so.2" >> /etc/ld.so.preload
```

2. 使用pm2守护进程
```javascript
//mtcp.config.js
module.exports = {
    /**
     * Application configuration section
     * http://pm2.keymetrics.io/docs/usage/application-declaration/
     */
    apps: [
        {
            name: 'mtcp',
            script: './remote.js',
            args: "",
            autorestart: true,

            cron_restart: '0 6 * * *',//每天6点重启
            watch: ["./"],
            // max_memory_restart: "300M",
            error_file: "./logs/mtcp_err.log",
            out_file: "./logs/mtp_out.log",
            time: true,
            log_date_format: "YYYY-MM-DD HH:mm Z",

            env: {
                "NODE_ENV": "production"
            }

            // node_args: ["--max_old_space_size=128", "--max_semi_space_size=4"],
        },
    ]
};

```

3.使用systemd启动(避免pm2占用70M左右的内存)
参考:[阮一峰教程](https://www.ruanyifeng.com/blog/2016/03/node-systemd-tutorial.html)
```
[Unit]
Description=mtcp

[Service]
ExecStart=/root/.nvm/versions/node/v20.18.0/bin/node ./remote.js
Restart=always
RestartSec=1
User=root
Group=root
Environment=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
WorkingDirectory=/home/mtcp/

[Install]
WantedBy=multi-user.target
```

# 性能测试
```
没有mTCP 单线程tcp 20m/s

有mTCP情况下

连接数:5
20Mb/s  ,164Mbps
93Mb/s  ,745Mbps
36Mb/s  ,293Mbps
44Mb/s  ,358Mbps
54Mb/s  ,435Mbps
62Mb/s  ,499Mbps
68Mb/s  ,546Mbps
66Mb/s  ,531Mbps
61Mb/s  ,489Mbps
86Mb/s  ,689Mbps
106Mb/s  ,853Mbps
38Mb/s  ,305Mbps
13Mb/s  ,106Mbps
28Mb/s  ,226Mbps

连接数:4
15Mb/s  ,121Mbps
67Mb/s  ,537Mbps
72Mb/s  ,583Mbps
75Mb/s  ,602Mbps
61Mb/s  ,495Mbps
60Mb/s  ,480Mbps
79Mb/s  ,635Mbps
76Mb/s  ,614Mbps
62Mb/s  ,500Mbps
49Mb/s  ,396Mbps
62Mb/s  ,499Mbps
26Mb/s  ,211Mbps

连接数:3
14Mb/s  ,114Mbps
54Mb/s  ,432Mbps
56Mb/s  ,450Mbps
56Mb/s  ,448Mbps
59Mb/s  ,472Mbps
56Mb/s  ,453Mbps
56Mb/s  ,451Mbps
56Mb/s  ,452Mbps
59Mb/s  ,479Mbps
55Mb/s  ,440Mbps
62Mb/s  ,497Mbps
32Mb/s  ,262Mbps
58Mb/s  ,468Mbps
56Mb/s  ,450Mbps
```

# 参考(类似项目)
1. https://github.com/wsmlby/mtcp    (有问题,连接池太多,内存问题,出错)
2. mptcp(不能加速)
3. https://github.com/mtcp-stack/mtcp (部署好复杂)
4. https://github.com/greensea/mptunnel (udp,udp明显不大好 现在运营商qos了)
