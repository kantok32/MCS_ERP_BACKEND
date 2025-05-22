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
    ttf-dejavu \
    ttf-liberation \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    font-noto \
    font-noto-cjk

# Set PhantomJS environment variables
ENV PHANTOMJS_SKIP_CHROMIUM_DOWNLOAD=true
ENV PHANTOMJS_BIN=/usr/bin/phantomjs

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Remove existing node_modules and install project dependencies
RUN npm install --production

# Copy the rest of the application source code to the container
COPY . .



# Expose the port your Nest.js application is listening on
EXPOSE 5001

# Command to start your Nest.js application
CMD ["node", "server.js"]