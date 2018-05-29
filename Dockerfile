FROM node:8-onbuild

EXPOSE 8443

# Install gem sass for  grunt-contrib-sass
RUN apt-get update -qq && apt-get install -y build-essential
RUN apt-get install -y ruby ruby-dev gcc
RUN gem install sass

# Install MEAN.JS Prerequisites
RUN npm install --quiet -g gulp bower yo mocha karma-cli pm2

RUN mkdir -p /opt/stanley-video-call
WORKDIR /opt/stanley-video-call

# Copies the local package.json file to the container
# and utilities docker container cache to not needing to rebuild
# and install node_modules/ everytime we build the docker, but only
# when the local package.json file changes.
# Install npm packages
COPY package.json /opt/stanley-video-call/package.json
RUN NODE_ENV=development npm install --quiet

# Set development environment as default
ENV NODE_ENV production

COPY . /opt/stanley-video-call
ADD . /opt/stanley-video-call
RUN npm run-script build

# Run MEAN.JS server
CMD ["npm","run-script","start"]