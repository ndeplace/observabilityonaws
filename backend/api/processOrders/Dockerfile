FROM node:14

# Create app directory
RUN mkdir -p /orders
WORKDIR /orders

# Install app dependencies
COPY ./package.json /orders/
RUN npm install
RUN npm install typescript -g


# Bundle app source
COPY . /orders/

RUN tsc meter.ts server.ts tracer.ts

ENV LISTEN_ADDRESS=0.0.0.0:80
EXPOSE 80

CMD ["node", "server.js" ]
