# Build stage
FROM node:20-alpine AS build

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace configuration and lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

# Copy package.json files for all packages and apps to allow pnpm to install dependencies
COPY apps/lite/package.json ./apps/lite/
COPY apps/docs/package.json ./apps/docs/
COPY packages/core/package.json ./packages/core/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the lite app
RUN pnpm --filter @readio/lite build

# Production stage
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/apps/lite/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
