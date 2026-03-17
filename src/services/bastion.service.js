import pkg from 'ssh2';
import fs from 'fs';
import { generateKeyPairSync } from 'crypto';
import Vm from '../models/vm.model.js';

const { Server, Client } = pkg;

class BastionService {
    constructor() {
        this.port = process.env.BASTION_SSH_PORT;
        // LƯU Ý: Đặt key vào thư mục data để dùng Docker Volume
        this.hostKeyPath = '/app/data/bastion.key'; 
    }

    getHostKey() {
        // Kiểm tra xem thư mục data đã có chưa, chưa thì tạo
        if (!fs.existsSync('/app/data')) {
            fs.mkdirSync('/app/data', { recursive: true });
        }

        if (!fs.existsSync(this.hostKeyPath)) {
            console.log("Đang khởi tạo SSH Host Key mới...");
            const { privateKey } = generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
            });
            fs.writeFileSync(this.hostKeyPath, privateKey);
            fs.chmodSync(this.hostKeyPath, '0600');
        }
        return fs.readFileSync(this.hostKeyPath);
    }

    start() {
        const server = new Server({
            hostKeys: [this.getHostKey()]
        }, (client) => {
            let targetVmIp = null;
            let targetUsername = null;
            let targetPassword = null;
            let proxyClient = new Client();

            client.on('authentication', async (ctx) => {
                if (ctx.method !== 'password') return ctx.reject(['password']);

                try {
                    const parts = ctx.username.split('#');
                    if (parts.length !== 2) return ctx.reject(['password']);

                    targetUsername = parts[0];
                    const targetVmName = parts[1].trim();
                    targetPassword = ctx.password;

                    console.log(`\n Bastion] Yêu cầu kết nối: User="${targetUsername}", VM="${targetVmName}"`);

                    const vm = await Vm.findOne({ vm_name: targetVmName });
                    if (!vm || vm.status !== 'running') {
                        console.error(`[Bastion] Từ chối: Không tìm thấy VM [${targetVmName}] đang chạy.`);
                        return ctx.reject(['password']);
                    }

                    targetVmIp = vm.ip_address;
                    console.log(`[Bastion] Tìm thấy [${targetVmName}] (IP: ${targetVmIp}). Đang kết nối nội bộ...`);

                    proxyClient.removeAllListeners();

                    proxyClient.on('ready', () => {
                        console.log(`[Bastion] Đăng nhập VM thành công! Đang cấp Shell...`);
                        ctx.accept(); 
                    }).on('error', (err) => {
                        console.error(`[Bastion -> VM] Lỗi kết nối: ${err.message}`);
                        ctx.reject(['password']);
                    }).on('keyboard-interactive', (name, instr, instrLang, prompts, finish) => {
                        finish([targetPassword]);
                    }).connect({
                        host: targetVmIp,
                        port: 22,
                        username: targetUsername,
                        password: targetPassword,
                        tryKeyboard: true,
                        readyTimeout: 10000
                    });

                } catch (err) {
                    ctx.reject(['password']);
                }
            });

            client.on('ready', () => {
                client.on('session', (accept) => {
                    const session = accept();
                    session.on('pty', (accept) => accept());
                    session.on('shell', (accept) => {
                        const clientStream = accept();
                        proxyClient.shell((err, targetStream) => {
                            if (err) {
                                clientStream.write('Lỗi: Không thể mở Shell trên máy ảo đích.\n');
                                clientStream.end();
                                return;
                            }
                            clientStream.pipe(targetStream);
                            targetStream.pipe(clientStream);
                            clientStream.on('close', () => {
                                targetStream.end();
                                proxyClient.end();
                            });
                        });
                    });
                });
            });

            client.on('end', () => proxyClient.end());
            client.on('error', () => proxyClient.end());
        });

        server.listen(this.port, '0.0.0.0', () => {
            console.log(`astion SSH Proxy đang chạy ở port ${this.port}`);
        });
    }
}

export default new BastionService();
