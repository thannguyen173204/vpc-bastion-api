import mongoose from 'mongoose';

const vmSchema = new mongoose.Schema({
    vm_name: String,
    ip_address: String,
    status: String
});

export default mongoose.model('Vm', vmSchema);
