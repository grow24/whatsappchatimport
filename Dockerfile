# Build React app
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Optional: set in Zeabur Variables before deploy (build-time for CRA)
ARG REACT_APP_WEBHOOK_URL
ENV REACT_APP_WEBHOOK_URL=$REACT_APP_WEBHOOK_URL

RUN npm run build

# Serve static build with nginx
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
