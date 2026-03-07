FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=""
RUN npm run build

FROM scratch
COPY --from=builder /app/dist /dist
