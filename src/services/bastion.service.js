import pkg from 'ssh2';
import fs from 'fs';
import { generateKeyPairSync } from 'crypto';
import crypto from 'crypto'; // Thêm thư viện crypto để kiểm tra key
import Vm from '../models/vm.model.js';
// import User từ '../models/user.model.js'; // Giả sử bạn có model User lưu public_key

const { Server, Client, utils } = pkg;

class BastionService {
    // ... [Phần constructor và getHostKey giữ nguyên] ...

    start() {
        const server = new Server({
            hostKeys: [this.getHostKey()]
        }, (client) => {
            let targetVmIp = null;
            let targetUsername = null;
            let targetPassword = null; 
            let proxyClient = new Client();

            client.on('authentication', async (ctx) => {
                try {
                    // 1. Phân tích Username (user#vm_name)
                    const parts = ctx.username.split('#');
                    if (parts.length !== 2) return ctx.reject(['password', 'publickey']);

                    targetUsername = parts[0];
                    const targetVmName = parts[1].trim();

                    // 2. Tìm VM trong Database
                    const vm = await Vm.findOne({ vm_name: targetVmName });
                    if (!vm || vm.status !== 'running') {
                        return ctx.reject();
                    }
                    targetVmIp = vm.ip_address;

                    // =============== XỬ LÝ PUBLIC KEY ===============
                    if (ctx.method === 'publickey') {
                        // Giả sử bạn lưu Public Key của user trong DB. 
                        // Ví dụ: const user = await User.findById(vm.owner_id);
                        // const allowedPubKey = utils.parseKey(user.public_key);
                        
                        // Ở đây lấy ví dụ cứng để minh họa. Trong thực tế lấy từ DB.
                        const dbPublicKeyString = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."; 
                        const allowedPubKey = utils.parseKey(dbPublicKeyString);

                        if (!allowedPubKey) return ctx.reject();

                        // Kiểm tra xem Key người dùng gửi lên có khớp với Key trong DB không
                        const isMatch = (
                            ctx.key.algo === allowedPubKey.type &&
                            crypto.timingSafeEqual(ctx.key.data, allowedPubKey.getPublicSSH())
                        );

                        if (!isMatch) {
                            return ctx.reject(); // Sai Key
                        }

                        // Nếu khớp, xác nhận hợp lệ. 
                        // Lưu ý: Nếu user đăng nhập bằng publickey, bạn cần lấy Password của VM từ DB để Bastion kết nối vào trong.
                        targetPassword = vm.password; // Lấy pass từ DB
                        
                        if (ctx.signature) {
                            // Xác minh chữ ký số
                            const verifier = crypto.createVerify(ctx.sigAlgo);
                            verifier.update(ctx.blob);
                            if (verifier.verify(allowedPubKey.getPublicPEM(), ctx.signature)) {
                                console.log(`[Bastion] Xác thực Public Key thành công cho ${ctx.username}`);
                                return ctx.accept();
                            }
                            return ctx.reject();
                        } else {
                            // Chấp nhận bước kiểm tra key (sẽ gọi lại lần nữa kèm signature)
                            return ctx.accept();
                        }
                    } 
                    
                    // =============== XỬ LÝ PASSWORD (Như cũ) ===============
                    else if (ctx.method === 'password') {
                        // ... logic check password cũ của bạn ...
                        targetPassword = ctx.password;
                        
                        // Nếu user cung cấp pass, ta có thể cho qua luôn để Bastion thử kết nối với VM đích
                        return ctx.accept(); 
                    }

                    // Nếu không phải 2 phương thức trên thì từ chối
                    return ctx.reject(['password', 'publickey']);

                } catch (err) {
                    console.error("Lỗi xác thực Bastion:", err);
                    ctx.reject(['password', 'publickey']);
                }
            });

            // ... [Phần client.on('ready') và pipe stream giữ nguyên] ...
        });

        server.listen(this.port, '0.0.0.0', () => {
            console.log(`[Bastion] SSH Proxy đang chạy ở port ${this.port}`);
        });
    }
}