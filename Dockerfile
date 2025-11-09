FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Clear Expo cache and build the web app fresh
RUN npx expo export --clear --platform web

EXPOSE 3000
CMD ["npm", "run", "server"]