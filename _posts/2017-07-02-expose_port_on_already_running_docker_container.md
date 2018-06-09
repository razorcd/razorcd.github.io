---
layout: post
title: Expose port on already running Docker container
---

This is for those times when we start a container and figure that no port or the wrong port was exposed. Docker uses it's own bridge network, that we can define or change but there is no official documentation about how it manipulates the OS routing rules. And there is no official solution to expose a port on a docker container but there are a few workarounds. Let's see what can we do.

For your information I am running the following versions:

```
➜  ~ docker --version
Docker version 18.03.1-ce, build 9ee9f40
➜  ~ uname -a        
Linux razor-xps 4.13.0-41-generic #46~16.04.1-Ubuntu 
```

## First we need a docker image

Let's work with a simple web application that runs on a port inside a container. We can build this quickly with `nodejs` and `http-server`.

Here is the `Dockerfile`

```dockerfile
FROM node:argon

WORKDIR /home

RUN npm install -g http-server

EXPOSE 8080

CMD [ "http-server /home" ]
```

Then to build the image: `docker build --tag http-server .` By running `docker images` the new `http-server` image should be present.

Let's just run it to see it in action:  `docker run --name http-server -p 8000:8080 http-server:latest`. Port `8080` from inside the container is exposed to port `8000` to our local OS. By requesting `http://localhost:8000` we can see the content of the `/home` folder from inside the container.

Great, now let's remove the container and start it again without exposing the port.

```
➜  ~ docker rm -f http-server 
http-server
➜  ~ docker run --name http-server http-server:latest 
Starting up http-server, serving ./
Available on:
  http://127.0.0.1:8080
  http://172.17.0.2:8080
```

Requesting `http://localhost:8000` should fail now.


Here are some ways we can still access the `8080` port that our inner server runs on.

## 1. Access the network IP directly

Each running container that is connected to the network has it's own IP. We can find out the IP of our `http-server` by running:

```
docker inspect http-server
```
In the returned JSON, look for `"IPAddress": "172.17.0.2"`, this is the IP of the container and it can be accessed from the main OS.

So we can request `http://172.17.0.2:8080/` and it should return again the contents of `/home` folder from inside the running container. If by any chance this is not working for you, check the OS firewall for this IP / port.


## 2. Commit state and start new container

The way Docker images work is by committing different states in the build process that can be reused. So we can commit the state of our container. This is very useful if we made changes inside the container after starting it. But remember that the heap will not be saved while stopping the container.

Let's start with making a state change to our container by adding a new file inside the container:

```shell
➜  echo "some_text" > test.txt
➜  docker cp test.txt http-server:/home
```

Requesting `http://172.17.0.2:8080/` would show the newly created file.

Let's commit container state.
```shell
docker commit http-server http-server-commit-1
```

It is important to understand what this does. All commands running on docker are saved and can be inspected by running `docker history http-server`.
Compare it to `docker history http-server http-server-commit-1` and notice that is one extra line created recently.

Now let's stop the running container with `docker stop http-server`. Requesting `http://172.17.0.2:8080/` should not work anymore.

And start the new committed one with correctly exposing inner port 8080:
```shell
docker run --name http-server-commit-1 -p 8000:8080 http-server-commit-1:latest
```

Request `http://172.17.0.2:8000/` will show the new files from new container.

#### To reset it back to the running container with no exposed port:

In case you did the last step let's reset it to the container with no ports exposed. 

```bash
➜  docker rm -f http-server-commit-1 
http-server-commit-1
➜  docker start http-server 
http-server
➜  docker ps
CONTAINER ID        IMAGE                COMMAND             CREATED             STATUS              PORTS               NAMES
62f166319cb5        http-server:latest   "http-server"       About an hour ago   Up 1 second         8080/tcp            http-server
```


## 3. By running another container as a reverse proxy in the same docker network

One docker container can access another container if both are in the same network. We will have access to our `http-server` container by starting a new container where we expose the port we want and forward all the requests to the `http-server` container.

Let's quickly build an `nginx` reverse proxy.

Create a file `default.conf` and add the minimum nginx reverse proxy configuration:

```
server {
    listen       8080;

    location / {
        proxy_pass http://http-server:8080;
    }
}
```

Then run a new `nginx` container while overwriting the default configuration.

```shell
docker run --name nginx -p 8000:8080 -v $(pwd):/etc/nginx/conf.d --link=http-server nginx
```
 - `-v` will will create a volume by sharing the current folder with the nginx config folder.
 - `--link=http-server` will bridge the two containers and add access to `http-server` using it's name as DNS.


Request `localhost:8000/` will show the files from `http-server` container while going trough the reverse proxy.

#### Cleanup this state

```
docker rm -f nginx
```

## 4. By doing port forwarding trough SSH

First we need to install `openssh-server` inside the container.

```shell
➜  docker exec -ti http-server bash
root@62f166319cb5:/home# apt-get update
...
root@62f166319cb5:/home# apt-get install -y openssh-server
...
root@62f166319cb5:/home# /etc/init.d/ssh start
[ ok ] Starting OpenBSD Secure Shell server: sshd.
```

Now we could set a password for `root` inside container and `ssh` using `root` user. But we can use the `sshd` user also. So let's do that.

From inside container:

```shell
root@62f166319cb5:/home# passwd sshd
Enter new UNIX password: 
Retype new UNIX password: 
passwd: password updated successfully
```

Then from outside container we can connect to our ssh server inside container and forward a port. Remember that these connections usually time out by default.

```shell
ssh -NfL 8000:localhost:8080 sshd@172.17.0.2
```

Request `localhost:8000/` will show the files from `http-server` container while going trough the ssh server.


------


Are there other ways to do this more cleanly? Please let me know.

Every time a port is exposed on a container, there is a new process running as `root`.

```shell
root     29904  0.0  0.0 182744  3484 ?        Sl   22:57   0:00 /usr/bin/docker-proxy -proto tcp -host-ip 0.0.0.0 -host-port 8000 -container-ip 172.17.0.3 -container-port 8080
```
I tried fiddling with this process and also changing `iptables` configurations but it didn't work for me.

```
➜  ~ sudo /usr/bin/docker-proxy -proto tcp -host-ip 0.0.0.0 -host-port 8009 -container-ip 172.17.0.3 -container-port 8080
2018/05/14 23:08:01 Stopping proxy on tcp/[::]:8009 for tcp/172.17.0.3:8080 (accept tcp [::]:8009: accept4: bad file descriptor)
```

I will end it here for now.

Happy coding.
