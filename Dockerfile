FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

# Tạo sẵn thư mục data
RUN mkdir -p /app/data

EXPOSE 2222 2223
CMD ["npm", "start"]
