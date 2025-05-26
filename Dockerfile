# Tag the image in Gcloud Artifact Registry (Only once)
# > docker tag qualtek_backend gcr.io/sylvan-rampart-447119-b2/qualtek_backend

###############
# Local Build #
###############

# Build this in the Root Directory:
# > docker build -t qualtek_backend .

################
# Gcloud Build #
################

# Build it directly with:
# > gcloud builds submit --config cloudbuild.yaml .

# Or alternatively push a local docker image to Gcloud Artifact Registry:
# > docker push gcr.io/sylvan-rampart-447119-b2/qualtek_backend


# Node Version
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Set environment variables
ENV HOST=0.0.0.0
ENV PORT=5001
ENV NODE_ENV=production
ENV TZ=America/Santiago

# Install system dependencies required for PhantomJS and other tools
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    fontconfig \
    fontconfig-dev \
    font-noto \
    font-noto-cjk \
    ttf-freefont \
    ca-certificates \
    openssl \
    openssl-dev \
    curl \
    curl-dev \
    zlib \
    zlib-dev \
    tzdata

# Install PhantomJS globally
RUN npm install -g phantomjs-prebuilt

# Create temp directory for PDF generation and set permissions
RUN mkdir -p /app/tmp && \
    chmod 777 /app/tmp && \
    chown -R node:node /app/tmp

# Set PhantomJS environment variables
ENV PHANTOMJS_SKIP_CHROMIUM_DOWNLOAD=true
ENV PHANTOMJS_BIN=/usr/local/bin/phantomjs
ENV TMPDIR=/app/tmp

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy the rest of the application source code to the container
COPY . .

# Set proper permissions for the application directory
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose the port your application is listening on
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Command to start your application
CMD ["node", "server.js"]