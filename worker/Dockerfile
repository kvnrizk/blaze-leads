FROM node:20-slim
RUN npx playwright install --with-deps chromium
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]
