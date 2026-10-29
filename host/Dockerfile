# Optional: run the host in Docker. Most people just run the program (see README.md).
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /citizens-host .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tor
COPY --from=build /citizens-host /usr/local/bin/citizens-host
ENV PORT=7447 BIND=0.0.0.0 DATA_DIR=/data TUNNEL=off STATUS=off
VOLUME /data
EXPOSE 7447
CMD ["citizens-host"]
