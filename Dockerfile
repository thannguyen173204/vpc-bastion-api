FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

# Tạo sẵn thư mục data
RUN mkdir -p /app/data

EXPOSE 2222 2223
CMD ["npm", "start"]
