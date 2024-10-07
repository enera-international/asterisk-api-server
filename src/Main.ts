import express from 'express';
import cors from 'cors'
import fs from 'fs'
import http from 'http'
import https from 'https'
import { RpcServerConnection, SocketIoServer } from '@source-repo/msgrpc'
import { DataProvider } from './DataProvider/DataProvider.js';

let port = process.env.PORT || 3001;
if (typeof port === 'string')
    port = parseInt(port)

export class Main {
    requests: { [index: string]: ((data: any) => Promise<any>) | undefined } = {}
    app: express.Express | undefined
    dataProvider: DataProvider<string>
    server?: http.Server
    transport?: SocketIoServer
    readyFlag = false
    constructor(public mongoDbUrl: string, db: string = 'emellio') {
        this.dataProvider = new DataProvider({ dbName: db, mongoDbUrl })
        this.app = express();
    }
    static async create(mongoDbUrl: string, dbName: string = 'emellio') {
        const instance = new Main(mongoDbUrl, dbName);
        await instance.init();
        return instance;
    }
    async ready() {
        while (!this.readyFlag || !this.dataProvider.readyFlag)
            await new Promise(res => setTimeout(res, 100))
    }
    async close() {
        await this.ready()
        this.server?.close()
        this.transport?.close()
        await this.dataProvider.close()
    }
    async init() {
        if (this.app) {
            this.app.use(express.json());
            this.app.use(cors())
            this.app.get('/users', (req: any, res: any) => {
                res.json({ status: 'Received data!' });
            })

            this.server = http.createServer(this.app)

            this.transport = new SocketIoServer('', this.server, undefined, false, [], { /* path: '/test' */})
            
            const rpc = new RpcServerConnection('app.rapidreach', [this.transport])
            rpc.rpcServer?.manageRpc.exposeClassInstance(this.dataProvider, 'dataProvider')
            rpc.rpcServer?.manageRpc.exposeObject({
                Hello: (arg: string) => {
                    console.log(arg)
                    return arg + ' World!'
                }
            }, 'MyRpc')
            
            this.server.listen(port, () => {
                console.log(`socket.io server is running on port ${port}`);
            })
            this.readyFlag = true
        }
        return this.server
    }
}
