import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BastionService from './services/bastion.service.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 2223;

// API Health check nhỏ để xem container có sống không
app.get('/health', (req, res) => res.json({ status: 'Bastion is alive' }));

mongoose.connect(process.env.DB_URL)
    .then(() => {
        console.log('✅ Bastion đã kết nối Database thành công!');
        app.listen(port, () => {
            console.log(`✅ Bastion Health-check API chạy ở port ${port}`);
            // Bật server SSH ngay sau khi có DB
            BastionService.start();
        });
    })
    .catch((err) => {
        console.error('❌ Lỗi kết nối DB:', err);
        process.exit(1);
    });
