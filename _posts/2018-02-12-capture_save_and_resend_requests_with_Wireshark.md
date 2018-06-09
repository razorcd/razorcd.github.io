---
layout: post
title: Capture, save and resend requests with Wireshark
---

Today I had to face a strange issue regarding inspecting requests over the network. I am working on a new feature where users can upload files to our server trough a mobile application. I am responsible for developing the backend part and exposing the proper API. The frontend parts for this feature are the mobile applications, Android and iOS done by remote developers.

So I exposed an endpoint, let's call it `POST /files` using `Content-Type` as `application/x-www-form-urlencoded`. I wrote the tests including integration tests and also manually tested the feature with PostMan and Curl, all working fine. 

I sent specifications to the mobile developers for implementation and they did it. But while the feature was working fine over iOS, the Andoid app was throwing a 500 exception on the server. After inspecting the logs it was clear that this happends while JAX-RS is parsing the content of the incoming request. Since the thrown exception wasn't clear, I spent some more time debugging the JAX-RS source code to understand where is the issue. I found that it was not finding the body of the request but nothing specific that I can fix.

So how else can I find out why this request is not working from Android and working from other clients? How to see what is the difference between the request coming from Android and the other one? And most important, how can I capture the request coming from an external outsource company and reproduce it localy so I can isolate the issue and debug quicker?

Well that can be done by monitoring the network packets on your network interface. And the best tool for that is Wireshark. It can be installed on any platform and it even can comitor network on a remote interface, like the virtual server in the cloud.




Let me how it is done. I will use a different POST request with a json body because I am not alowed to discolse work related data.

### Setup

Install `tshark`, the CLI version of Wireshark, for capturing requests. I will use this to capture the requests and save them to a file. Wireshark UI can be also used but I prefer `tshark` because you can use it directly on the servers too.

Next start your local server that will respond to the requests you want to monitor. In my case this is the request I want to capture:

```shell
curl  -vX POST 'http://localhost:8080/incoming/6e163a12f20a1/test_request?param1=5' -H 'content-type: application/json' -d '{"body1": 2}'
```
with returns a `HTTP/1.1 204`. 

### Capture and save requests with Tshark

Run `sudo tshark -D` to see all the interfaces you have. You can see a more datailed list by running `ifconfig`.
These are my interfaces. For you it will be different and you have to identify with one is your traffic going trough. For example `wlp2s0` is the wireless interface for me, `lo` is the localhost.
```
1. wlp2s0
2. docker0
3. veth269a7a3
4. any
5. lo (Loopback)
6. br-07d6a9d979c6
7. br-cc51a943a4a9
8. bluetooth0
...
```

Because I have all the applications running locally, I will continue by using `lo` interface.

To capture to a file, tshark requests that the user that runs the command is also the owner of the captured file (security reasons). So lets prepare this file:

```shell
mkdir /tmp/tshark
touch /tmp/tshark/c1.pcap
chmod o=rw  /tmp/tshark/c1.pcap
```

Great, now we can start capturing by running:
```shell
sudo tshark -i lo -w /tmp/tshark/c1.pcap
```
To capture only `http` packets also use the `-f "http"` flag.

Notice that the packets will grow fast, and there is a lot of traffic behind the scenes that we are not aware of.


Let's run the request we want to monitor:
```shell
curl  -vX POST 'http://localhost:8080/incoming/6e163a12f20a1/test_request?param1=5' -H 'content-type: application/json' -d '{"body1": 2}'
```
Great, we get a `HTTP/1.1 204` response.

Now stop the running `tshark` application. All the traffic is captured in the `c1.pcap` file, which is a format that Wireshark UI can read. So open it with Wireshark UI and filter the frafic with `http`. Notice the raw request we are monitoring. Right click on that packet then `follow->http stream` to see the entire raw request and response.

```
> POST /incoming/6e163a12f20a1/test_request?param1=5 HTTP/1.1
> Host: localhost:8080
> User-Agent: curl/7.47.0
> Accept: */*
> content-type: application/json
> Content-Length: 12
> 
* upload completely sent off: 12 out of 12 bytes
< HTTP/1.1 204 
< X-Content-Type-Options: nosniff
< X-XSS-Protection: 1; mode=block
< Cache-Control: no-cache, no-store, max-age=0, must-revalidate
< Pragma: no-cache
< Expires: 0
< X-Frame-Options: DENY
< Date: Sun, 27 May 2018 10:40:49 GMT
```

We captured something, the pcap file is bigger now:

```shell
➜  ls -la
... 39K c1.pcap
```

This is what we needed. Now let's see how can we resend this captured request.


### Converting captured requests

All the captured network packets are in the c1.pcap file in binary format. We only want to reply our own request (resend only the packets that are relevant to us). Resending the entire packets would not work anyway because the way TCP works is by first performing a unique handshake to establish connection and then sending the packets. By just sending the same packets from the .pcap file would result in an invalid handshake that the server will not validate. As a sidenote, using UDP does not reply on a handshake and sending the same packets would work. But again, we still need to extract the packets we need to resend.

We need to convert this binary file into a human readable format and extract the request we want to redo.

The tool to do this well is `tcptrace`. Install it with `sudo apt-get update && sudo apt-get install tcptrace`

Then let's run it against our `c1.pcap` file.

```shell
mkdir tcprequests
tcptrace --output_dir="tcprequests/" -l -e c1.pcap 
```

All the requests and responses are separated in files and we can read them.

```shell
➜ ls tcprequests 
i2j_contents.dat  k2l_contents.dat  u2v_contents.dat  w2x_contents.dat
j2i_contents.dat  l2k_contents.dat  v2u_contents.dat  x2w_contents.dat
````


Looking over the file contents, there is one that represents out request that we want to replay:

```shell
➜ cat tcprequests/w2x_contents.dat 
POST /incoming/6e163a12f20a1/test_request?param1=5 HTTP/1.1
Host: localhost:8080
User-Agent: curl/7.47.0
Accept: */*
content-type: application/json
Content-Length: 12

{"body1": 2}%   
```

We also have the captured response for this request. We don't need that right now, but just FYI:

```shell
➜ cat tcprequests/x2w_contents.dat 
HTTP/1.1 204 
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Pragma: no-cache
Expires: 0
X-Frame-Options: DENY
Date: Sun, 27 May 2018 10:48:51 GMT
```


## Resending captured requests

All that is left is to send this captured request. We can do that with `netcat` that comes with Ubuntu 16.04.

```shell
➜ cat tcprequests/w2x_contents.dat | nc localhost 8080 

HTTP/1.1 204 
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Pragma: no-cache
Expires: 0
X-Frame-Options: DENY
Date: Sun, 27 May 2018 11:01:13 GMT
```

Notice same response was returned from the server because this web service is idempotent. Also notice we can send the same request to a different host.
Now we can also edit the `tcprequests/w2x_contents.dat` and resend it. It also supports binary data transfer like file uploads.

### Future reminder

In a future article I will explain how can you do a live monitor/network-capture on a remote server through ssh. You would not believe how much background traffic is happening there. All servers are being spammed a lot, specially by bots looking for php vulnerabilities even though the server has no such thing installed.

---

That's about it.

Happy coding.
