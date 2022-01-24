---
layout: post
title: Scaling reactive APIs
---


Realtime applications are becoming more and more popular, streams of data travel from one service to another continuously. We want our entire microservices architecture behaving like closed electronic circuits, always reacting on any input changes, triggers, or interruptions. Everything working together like a symphonic orchestra. And if this is not complex enough, we have to continuously grow our businesses, more and more data has to go through our reactive circuit. Services have to process more without appearing slower to the end consumer.
Frontend applications are becoming realtime mirrors that reflect any change that our orchestrated backend services do. We can achieve this by streaming data from backend services to frontend applications in realtime, keeping the end user updated with all changes the system is going through.
It is an impressive evolution of cloud applications.
But growth always comes with challenges, one of which is to make an API service scalable, a service that exposes a reactive API that opens an event stream on each HTTP request and keeps it open for a long period of time, updating the customer with any state change, continuously for many minutes or even hours.
At [JustEat Takeaway.com](https://www.justeattakeaway.com){:target="_blank"}, the Tracker application uses this reactive API every day to inform millions of customers about the state of their orders in realtime.

## How reactive APIs work?

A client does an HTTP request to the server and a data stream is opened where the server can communicate to the frontend. Think WebSockets but one way, only server emits data to the frontend. Both sides of the stream can close the stream and a heartbeat is present too. The client dictates how much data is being sent through the stream from the backend based on how fast it can process it, a feature known as backpressure.

## So what is the problem?

On the backend side, data that is published through the API towards the frontend has to also come from a source. In our case it is coming from a number of different partitioned Kafka topics. Because we are talking about high data streams, the input had to be distributed through multiple Kafka partitions to process multiple events in paralel.

In the diagram below I describe the architecture we started with:

1. We receive the events from different partitions (Kafka Topic A: Partition 1, Partition 2, Partition 3). Each partition is sending data only to one Service instance, ensuring that each input event is processed only once by one Service instance. In this diagram example, `DataUpdatedEvent` is being received through `Kafka Topic A, Partition 3` and processed by `Service Instance 2`.
2. In our service, for each input event, we create and update projections, our Customer Aggregate (Service: Instance 1, Instance 2). The projection is persisted in the DB that is shared between all instances. After the projection is updated successfully, we emit the update event to the reactive API so any listening customer gets updated too. Can be same event or better a new event for the query side, but for our example it does not matter. Each customer would receive updates only from it's own Aggregate so we have to make sure we channel the right updates only to the customer that it corresponds to.
3. A gateway is in front of the API that takes all Customer requests and directs them to only one Service instance. In this example the `API Gateway` is directing the `/customer1` request to `Service Instance 1`.

*And here is the problem*: if data coming from the input Kafka topics is partitioned and we scale our service horizontally to take advantage of each instance processing only a part of the entire data, how can we ensure that the same service that received the HTTP request also processes the corresponding input partition.


```
                       +----------------------------+
                       | Kafka Topic A, Partition 1 +------.    +--------------+                     +-----------+
                       +----------------------------+       `-->+   Service    |                     |           |
                                                                |  Instance 1  +<---------------+    |           |         API HTTP request
                       +----------------------------+       ,-->+              |                |    |           +<----- Event stream listener
                       | Kafka Topic A, Partition 2 +------`    +--------------+                |    |    API    |            /customer1
                       +----------------------------+                                           +----+  Gateway  |
                                                                +--------------+                     |           |
                       +----------------------------+           |   Service    |DataUpdatedEvent     |           |
 Customer1 data ------>+ Kafka Topic A, Partition 3 +---------->+  Instance 2  |----------------+    |           |
DataUpdatedEvent       +----------------------------+           |              |                |    |           |
                                                                +--------------+                |    +-----------+
                                                                                                |
                                                                                                +--> No Event stream listener
```

For example a customer opens an event stream by doing a HTTP request on `/customer1` to the `API Gateway`. The gateway assigns `Service Instance 1` to process this request and set the stream publisher.
On the other end, Customer1: `DataUpdatedEvent` comes through `Kafka Topic A, Partition 3` which is processed by `Service Instance 2`. But this service has no open streams on the API, there is no listener of the updates from the API side. Only `Instance 1` knows about the opened event stream listener `/customer1`.


## Solutions 

So it is clear that we need a solution to align input and output so `DataUpdatedEvents` have a clear way through `partition - service instance - event stream listener`.

*I have tested 3 possible solutions to find the optimal one:*

## #1 Quick Solution

One quick solution would be to share the `DataUpdatedEvent` between all the `Service instances`, after the projection is updated. We don't know which Service Instance has the customer listener (request) but if we take each `DataUpdatedEvent` and do a fan-out to all the existing services, eventually the instance with the stream listener will get the event and send it through.

In this case Customer1 `DataUpdatedEvent` would travel like this: 
```
Kafka Topic A, Partition 3 --> Service Instance 2 --> internal Kafka topic +---> Service Instance 1 --> Event stream listener /customer1
                                                                            `--> Service Instance 2
```

Sharing the events between the instances can be done easily using another `internal Kafka topic`. Each `Service instance` will publish it's own processed events from `Topic A` and publish all events for the Query side to the `internal Kafka topic`. Also, each instance will listen to all the events from all the partitions of the `internal Kafka topic` (using an asynchronous Kafka consumer-group).

This would work well until one point where the `internal Kafka topic` becomes the bottleneck, because we lose part of the partitioning benefits. Even if updating the projections are still done only by one `Service instance`, the `DataUpdatedEvents` still have to be received by all instances from the `internal Kafka topic`, published to the listener by 1 instance and ignored by the other instances.

## #2 Simple Solution

This was my first approach. Use event sourcing to store the events which form the projection (the Aggregate) and let Reactive Mongo emit it on each save.
So on a `/customer1` HTTP request, we should open an event stream directly using the Reactive-Mongo Java driver by doing a query to get all events representing `customer1`. This stream would be kept open. On each save of another `Customer1 DataUpdatedEvent` or another event representing the state update, Mongo would also run it against any open stream queries to publish the `DataUpdatedEvent` through the existing open stream.

In this case Customer1 `DataUpdatedEvent` would travel like this: 
```
Kafka Topic A, Partition 3 --> Service Instance 2 --> Reactive Mongo --> Service Instance 1 --> Event stream listener /customer1
```
You can check my GitHub code example: https://github.com/razorcd/scalable-realtime-tracking/tree/reactive_mongo_partitioned/src/main/java/com/takeaway/tracking

Nice and simple. This would be a good solution for internal private dashboards that have a limited number of users.
Unfortunately this will not scale much. On each HTTP request, we create a new Reactive Mongo query that would open a separate Mongo connection. This database connection would be open until the HTTP event stream is also open. So our customer size and the Mongo connections will grow 1 to 1. Not scalable at all.
We need a better solution that can handle multiplexing.

## #3 Best scalable solution

So I realized I need a solution that can do multiplexing to the datasource, to use a limited connections pool. A way to add/remove queries on the fly to the existing multiplexed connections. Of course while keeping the partitioning benefits all the way from input Kafka to the reactive API.

After investigating further I came up with a viable solution using `Redis-Streams` (newly released with Redis v5) with a self customized `redis-streams-client`.


### A little about Redis-Streams first:

Basically, the Streams in Redis came with v5 and it's a powerful feature where you can create a queue based on a Key where items are inserted and retrieved in a FIFO manner. On the other end, queries can be made on the Stream Keys and if there are no relevant old items in the Stream, the listener will wait until a new item will be published.

Redis can handle a huge number of different Stream keys. I have tested with 1 million + streams queried at the same time and it worked very fast.
You can read more about it directly on the [Redis website](https://redis.io/topics/streams-intro){:target="_blank"}.

### The design of the Service

```
                                                                     +-------------- +
Kafka Listener  --> Business Logic --> Repository(ResdisClient) -->  |               |
                                                                     | Redis Streams |
API Controller  -->  Repository(Redis Poller) -------------------->  |               |
                                                                     +---------------+
```

### Part1: Saving the events

The first part is persisting the events that will be served later by the API query. To do this we simply create a Kafka listener that will apply each incoming event to the Business Logic. For explaining how the scalable API works, we don't care how the Business Logic works. In the end the Business Logic will emit an event for the Query side of the application (as of CQRS architecture). This event will be saved in Redis to a particular Stream.

We need to define one stream for each customer's data. To do this we will use the `customerId` as the stream Key and the event itself as the value. Every time a record is saved, Redis will create a new stream if the Key doesn't exist already. If the stream exists, the event will be appended to the stream events queue.

There will be a collection of open API streams for all customers. Each instance will have its own streams collection, perfect for partitioning.

Also, there will be a `RedisPuller`, one per instance, that will pull events from Redis streams, querying multiple Redis streams in same query. This puller will run continuously, taking the streams to query from the API streams collections. Also the API collection would change dynamically without interrupting the puller, each new API request would add a stream to the collection and each time a customer closes the stream, it would remove it from the collection.

*Let's see this implementation in details*:

The listener is using a reactive aproach based on Reactive Flux from Spring (`spring-cloud-streams-reactive`). Each event is parsed, applied to the business logic using the `doBusinessLogic` method. This method will return a `CustomerUpdatedEvent` internal event for the Query side that represents the information we want to send to the API later. The `CustomerUpdatedEvent` is then passed to the `CustomerRepository`.

```java
@Component
@RequiredArgsConstructor
public class CustomerListener {

    private final CustomerRepository<CustomerUpdatedEvent> customerRepository;

    @StreamListener("customer-events")
    public void customerEventsConsumer(Flux<DataUpdatedEvent> event) {
        event.map(this::parseEvent)
             .doOnNext(MyService::doBusinessLogic)   // returns CustomerUpdatedEvent
             .subscribe(customerRepository::save);
    }
}
```

 `CustomerRepository` will save the `CustomerUpdatedEvent` to Redis into a Stream. The stream name will be the `id` of the customer defined by the `getStringId()` method. Actually the Query side starts here, this part is completely separated from the business logic.

```java
@Repository
@RequiredArgsConstructor
public class CustomerRepository<E extends Identifiable> {
    
    private final RedisTemplate<String,E> staticTemplate;

    public void save(E event) {
      staticTemplate.opsForStream().add(ObjectRecord.create(customer.getStringId(), event));

    };
}
```
Indeed, the event will be saved as a byte array in Redis so no need for any special encoding. Since these Redis streams are internal for this application, both saving and querying is done in the same Repository. A standardized encoding protocol would just waste processing resources. Only downside is when inspecting Redis manually, it is not possible to directly read the events as text. If that is important, a JSON encoder/decoder would do fine here.

And finally the `CustomerUpdatedEvent` implementing an `Identifiable` to guarantee the string `id` that we need to be able to save in Redis.

```java
@Value
public class CustomerUpdatedEvent implements Identifiable {
    private final String id;
    private final Data data;
    private final Instant changedAt;

    @Overwrite
    public String getStringId() {
        return id;
    }
}
```

### Part2: Building the Redis puller

Next we build an engine that will allow us to subscribe to many reactive streams and keep them open, limited by the allocated memory.
Then as soon as new data arrives in Redis, it pulls the new data and sends it to the correct streams. We will call this engine `RedisPuller`.

There are 2 sides of this puller engine. One to add and remove the API event streams and second to pull real-time data regularly from Redis and publish it to the correct API event stream. Both of these sides will use a Map data structure to keep all open API event streams:

```java
Map<String,EventStream> streamsList = new ConcurrentHashMap<>();
```
It will use a `ConcurrentHashMap` instead of simple `HashMap` to be multi-threading proof while multiple customers can connect to the live `RedisPuller` at the same time.

```java
@Value
public class EventStream {
    private final String eventStreamId;
    private final Long offsetTimeMs;
    private final Long offsetCount;
    private final Set<FluxSink<Object>> fluxSinks;

    public void addStream(FluxSink<Object> newFluxSinkObject) {
        synchronized(this) {
            fluxSinks.add(newFluxSinkObject);
        }
    }

    public void removeStream(FluxSink<Object> existingFluxSinkObject) {
        synchronized(this) {
            fluxSinks.remove(existingFluxSinkObject);
        }
    }

    public boolean hasListeners() {
        return !fluxSinks.isEmpty();
    }

    //closes all stream connections with an error message.
    public void sendError(String message) {
       fluxSinks.forEach(fluxSink -> fluxSink.error(new ConnectionClosedException(message)));
    }

    //publish an event to all streams
    public void publishEvent(String event) {
        fluxSinks.forEach(fluxSink -> fluxSink.next(event));
    }

    //creates a new object with updated offsets
    public EventStream withOffset(Long offsetMs, Long offsetCount) {
        return new EventStream(this.eventStreamId, offsetMs, offsetCount, this.fluxSinks);
    }
}
```
The Key of the Map is the `customerId` as String. The value is an `EventStream` which is a wrapper over a collection of `FluxSink<Object>` that are the open API streams and some metadata. 

- `String eventStreamId`: the `customerId`, same as the Map key.
- `Long offsetTimeMs`: offset to know which was the last event pulled from Redis. This is stored as milliseconds from Epoch.
- `Long offsetCount`: counter offset, in case there are multiple events at the same time offset.
- `Set<FluxSink<Object>> fluxSinks`: the open API stream collection that is used to publish data to the customer.


#### Pulling data from Redis-Streams in real-time and publishing to the correct API event stream

Now that we have a list of API event streams opened by the customers, we can use this to pull the data from Redis for all these customers.

First we build an array (`streamArray`) of `StreamOffset` objects, that the Redis client needs to pull data from Redis. 

If there are no API streams then we will stop the execution here without doing any Redis connection.

Next it will do one Redis-Stream query to pull first batch of events. The most important part is that the Redis client accepts a list of Streams to pull from. It will pull one batch of data from all the streams in one network request. In case the Redis connection fails, it will close all customer API streams to inform the customers about the error.

Once it has the new events batch from Redis, it iterates over them and publishes one by one to the correct stream based on `customerId`. For each published event it will also update offsets in the main `EventStream` collection. This way the next time we call this method it will continue to pull from the last offset it left off.

```java
@RequiredArgsConstructor
public class RedisPuller {
    
    private final RedisTemplate<String,String> redisTemplate;
    private final Map<String,EventStream> streamsList = new ConcurrentHashMap<>();

    public void runPuller() {
        //create stream array of StreamOffset objects
        Set<StreamOffset<String>> streams = buildStreamOffsets(this.streamsList.values().stream());
        StreamOffset<String>[] streamArray = new StreamOffset[streams.size()];
        streams.toArray(streamArray);
        return streamArray;

        if (streamArray.length == 0) return;

        //pull batch
        List<ObjectRecord<String, T>> eventBatch;
        try {
            eventBatch = pullBatch(streamArray);
        } catch (RedisException redisEx) {
            closeAllStreams(streams, "Connection error.")
            throw redisEx;
        }

        //publish events to the API streams
        eventBatch.forEach(it -> {
            final T event = it.getValue();

            //get the EventStream object that matches the current event stream from Redis
            EventStream eventStreamMatch = this.streamList.get(it.getStream());

            eventStreamMatch.publishEvent(event);

            //update offsets in main stream collection
            this.streamList().put(it.getStream(), eventStreamMatch.with(it.getId().getTimestamp(), it.getId().getSequence() + 1));
        });
    }

    private Set<StreamOffset<String>> buildStreamOffsets(Stream<EventStream> streams) {
        return streams.filter(EventStream::hasListeners)
                .map(stream -> StreamOffset.create(stream.getStreamName(), ReadOffset.from(""+stream.getOffsetTimeMs()+"-"+stream.getOffsetCount())))
                .collect(Collectors.toSet());
    }

    private List<ObjectRecord<String,String>> pullBatch(StreamOffset<String>[] streamNamesArray) throws RedisException {
        return redisTemplate.opsForStream().read(String.class, streamNamesArray);
    }

    private void closeAllStreams(Set<StreamOffset<String>> streams, String message) {
        streams.values().forEach(streamObj -> streamObj.sendError(message));
    }
}
```

The `runPuller()` method could measure execution time, and add a time limit to wait next execution if it took less then 1 second for example. Just to not choke the network with unnecessary Redis queries. It is better to have less requests with more events than more requests with less events. This could cause a maximum of 1 second delay, totally acceptable.

There is one last important part here. This method needs to run continuously. And to build a resilient system, it will run in a separate thread and recover itself in case of a failure. For example, restarting Redis should not crash this system, just temporary interrupt the events publishing.

Also the class implements `AutoCloseable` now so it can stop the Thread when the puller is not needed anymore, like a system restart.

The existing `RedisPuller` class will be updated with the continuous pulling thread:

```java
public class RedisPuller implements AutoCloseable {
    
    private final RedisTemplate<String,String> redisTemplate;
    private final Map<String,EventStream> streamsList = new ConcurrentHashMap<>();
    private final Thread pullerThread = getPullerThread(this.streamsList);

    public RedisPuller(RedisTemplate<String,String> redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.pullerThread.start();
    }

    @Override
    public void close() {
        this.pullerThread.interrupt();
    }

    private Thread getPullerThread(Map<String,EventStream> streamsList) {
        return new Thread(() -> {
            while (true) {
                try {
                    staticRedisPoller(streamsList);
                } catch (Exception e) {
                    log.info("Closing RedisPuller#{}: Error: {}", Thread.currentThread(), e);
                } finally {
                    Uninterruptibles.sleepUninterruptibly(1, TimeUnit.SECONDS); // retry time
                }
            }
        });
    }

    //... puller methods like above
}
```


### Part3: Building the API

Last part is about opening an event stream on each API request and add that stream to the `RedisPuller`, so the puller can pull events from Redis and send them to the stream. 

When the customer interrupts the API request or there is a network issue, the stream will be closed and will trigger the removal of the stream from the `RedisPuller`. This way customers can open and close streams dynamically without interrupting the puller thread.

The method will have 2 arguments:
- `String eventStreamId`: the `customerId`, sent by the customer on the API request
- `fromMs`: the starting Redis-Streams offset, represented by the time in milliseconds when to start querying from. To receive only realtime events, current time in milliseconds can be passed here.

```java
private final Map<String,EventStream> streamsList = new ConcurrentHashMap<>();

public Flux<CustomerUpdatedEvent> getStreamEvents(String eventStreamId, long fromMs) {
    //add new eventStream to Set
    EventStream eventStream = new EventStream(eventStreamId, fromMs, 0, new HashSet());
    streamsList.putIfAbsent(eventStreamId, eventStream);

    //create a Flux and add the Sink to the EventStream to be used for publishing
    Flux<Object> events = Flux.create(sink -> eventStream.addStream(sink));

    //configure the Flux and return it
    return events
            .cast(CustomerUpdatedEvent.class)
            .timeout(Duration.ofMinutes(60))
            .doFinally(e -> {
                eventStream.removeStream(eventStream);
                log.debug("Finally UNRegistering consumer:{}. Cause:{}.", eventStreamId, e);
            });
}
```

The method returns a flux of `CustomerUpdatedEvent`, the `cast()` method would do the conversion directly so there is minimum conversion resources needed.

On the controller side it is pretty straight forward, inject the `RedisPuller` singleton and call this `getStreamEvents()` method. Then just return the newly created Flux stream.

```java
@RestController
public class CustomerController {
    private final RedisPuller redisPuller;

    @GetMapping(value="/customer/{customerId}",produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<CustomerUpdatedEvent> getCustomerData(@PathVariable String customerId) {
        return redisPuller.getStreamEvents(customerId, Instant.now().toEpochMilli());
    }
}
```

## Conclusion

The circuit is complete. Saving and querying events using Redis-Streams work independently. Adding/removing customer event streams and continuously pulling data from Redis also work independently. The code can be updated to allow any of these parts to run in parallel.

Load testing was a bit challenging. But I managed to simulate over 250 000 simultaneously opened connections on an AWS production environment, so no networking latency. And I was continuously sending and reading events in realtime and measuring if delays are happening between input time and output time. The system could definitely handle more connections.

For load testing the `RedisPuller` integrated with `Redis` part only, I managed to simulate pulling data from Redis from 1 million streams in one single query. I am very impressed on how fast `Redis-Streams` is.

The architecture of the `RedisPuller` was inspired from `kafka-clients` which also pulls data from a source continuously. Unfortunately Redis is not handling offsets with consumer-groups like Kafka does, that is why I added the offsets in the `EventStream` class.

So far this is running in production for more than 6 months and it was very stable.

The application services can be scaled horizontally to allow data to be distributed. All services will use same Redis server. The next bottleneck point of the system will be Redis connection, for sure. To improve this, sharding the Redis server would be the next step. I would suggest adding monitoring/alerting to be prepared when business grows to that point.

API event streams can handle backpressure, this can be connected to the `RedisPuller` and configure to pull data slower from Redis when customer stream indicates to slow down the publishing rate. Of course this has to be done independently on each `EventStream` object.

The implementation I explained here is a simplified version of what I use in production and the Customer domain is just made up. Even so, this example is production ready but it needs some validations, monitoring and logging. There should be a query limiter to not allow more than one query per second. Also Redis needs a size limit cleanup to not consume memory forever. A graceful shutdown protection would be useful to allow the `RedisPuller` thread to finish pulling before interrupting. Gateways and firewalls also need to be updated to manage long running requests.

I hope you enjoyed reading this as much as I enjoyed developing it. Would be great to have this feature implemented directly in the Redis-client directly. Maybe one day I can work on adding this, when the time will have a different dimension.

Thanks for reading. :)


---


Thanks to Tracker team, CloudOps team and entire Scoober department from [JustEat Takeaway.com](https://www.justeattakeaway.com){:target="_blank"} for all the great support over the time.