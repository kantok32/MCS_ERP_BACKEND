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
FROM node:21

# Set the working directory inside the container
WORKDIR /app

ENV HOST=0.0.0.0 

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Remove existing node_modules and install project dependencies
RUN rm -rf node_modules && npm install

# Copy the rest of the application source code to the container
COPY . .

# Build the app (generate /dist/)
#RUN npm run build

# Expose the port your Nest.js application is listening on
EXPOSE 3000

# Command to start your Nest.js application
CMD [ "npm", "run", "start:prod" ]