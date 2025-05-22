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

ENV HOST=0.0.0.0 

# Install system dependencies required for PhantomJS
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
    zlib-dev

# Install PhantomJS globally
RUN npm install -g phantomjs-prebuilt

# Create temp directory for PDF generation
RUN mkdir -p /tmp/pdf && chmod 777 /tmp/pdf

# Set PhantomJS environment variables
ENV PHANTOMJS_SKIP_CHROMIUM_DOWNLOAD=true
ENV PHANTOMJS_BIN=/usr/local/bin/phantomjs
ENV TMPDIR=/tmp/pdf

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application source code to the container
COPY . .

# Expose the port your Nest.js application is listening on
EXPOSE 5001

# Command to start your Nest.js application
CMD ["node", "server.js"]