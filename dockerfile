# ---------- Build ----------
FROM node:24.15.0 AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# ---------- Producción ----------
FROM nginx:alpine

COPY --from=build /app/dist/ReportesAnonimos/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]