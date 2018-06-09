---
layout: post
title: Binding Java/Spring microservices using Feign
---

Recently I am working on the edge microservice of a distributed system, let's call it `Microservice 1`. This is built using Spring Boot and as usually it uses Spring MVC to build it's internal API defined by Java interfaces and DTOs. `Microservice 2` wants to consume the API provided by `Microservice 1` so we need to bind these 2 microservices together. But what is the ideal way to do this in this case? Since microservices architectures are relying very much on bounded context and loose coupling we need to do this with minimum intersection but also avoiding duplications.

```
     __________________                          __________________
    |                  |(client)        (server)|                  |
    |  Microservice 2  |_______________________\|  Microservice 1  |
    |   Spring Boot    |                       /|   Spring Boot    |
    |__________________|                        |__________________|

```

There are many ways for a microservice to connect to this edge microservice and it is very convenient when they both share the same externalized contract definitions. Swagger is very helpful in this case, creating the contracts as Json or Yaml and using tools to covert these files to generate http clients in Java and also other languages. As much as I like the idea and since here I have Java based microservices, all internal to our system, I decided to use Feign (part of Spring Cloud) and create a direct dependency from `Microservice 2` client to `Microservice 1` API, so they share the same interfaces and DTOs as contract definitions.

I have built a demo application to demonstrate this. It's using 2 microservices built with Java 8, Spring Boot 1.5.9, and Maven 3.5. 

Let's first see the Interface and DTOs that `Microservice 1` is exposing. 

```java
@RequestMapping(value = "/resource", 
                consumes = MediaType.APPLICATION_JSON_VALUE, 
                produces = MediaType.APPLICATION_JSON_VALUE)
public interface ResourceApi {

    @RequestMapping(method = RequestMethod.GET)
    List<ResourceDto> getResources();

    @RequestMapping(method = RequestMethod.POST)
    void createResource(@RequestBody ResourceDto resourceDto);

   @RequestMapping(value = "/{id}", method = RequestMethod.DELETE)
   void deleteResource(@PathVariable long id);
}
```

```java
public class ResourceDto {

    private long id;
    private String data;
 
    // no args constructor 
    // getter and setters
    // equals and hashCode
}

```

The implementation of `ResourceApi` interface is not relevant in this example. 


This Interface and DTO is included in a separate Maven module, part of the `Microservice 1` jar:

```xml
    ...
    <!-- Microservice 1: 'microservice1-api' module -->
    <groupId>com.example</groupId>
	<artifactId>microservice1-api</artifactId>
	<version>0.1.9</version>
	<packaging>jar</packaging>
    ...
 ```

This interface implementation provided by `Microservice 1` should not be changed to continue to use Springs default implementation and also to continue to allow different clients to consume it. `Microservice 1` should not care who and how is it's API consumed as long as it is following it's contract. So I decided to not include any Feign server implementation in `Microservice 1`. This will allow a better decoupling and better evolvability in a polyglot system.

So from here onward we will focus on implementing the client in `Microservice 2`.

Let's add the Feign maven dependency and we also need to provide an encoder/decoder to Feign. Since `Microservice 1` is following REST with JSON, I will add the Jackson serializer.

```xml
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-feign</artifactId>
    </dependency>
    <dependency>
        <groupId>io.github.openfeign</groupId>
        <artifactId>feign-jackson</artifactId>
    </dependency>
```

We also need to import the API from `Microservice 1`. So in `pom.xml` from `Microservice 2` we also add:

```xml
<dependency>
    <groupId>com.example</groupId>
	<artifactId>microservice1-api</artifactId>
	<version>0.1.9</version>
</dependency>
```



Now let's define the `ResourceClient` as a Feign Client Bean.

```java
@Configuration
public class ResourceClientConfig {

    @Value("app.microservice1.url")
    private String microservice1Url = "http://localhost:8081";
    
    @Autowired
    private Client feignClient;
    
    @Bean
    public ResourceApi getResourceApi() {
        return Feign.builder()
                .client(feignClient)
                .contract(new SpringMvcContract())
                .encoder(new JacksonEncoder())
                .decoder(new JacksonDecoder())
                .logger(new Slf4jLogger(ResourceApi.class))
                .logLevel(Logger.Level.FULL)
                .target(ResourceApi.class, microservice1Url);
    }
}
```

And here you can see Faign's flexibility. The client, contract, coder/decoder and loggers are all replaceable. So you can rely the business logic on Feign and if you want to change the tools later it can be done without editing any Feign client consumer.

Let's go over the above code quickly.

- `Client` is the Default Feign client that can be injected from Spring context. Feign also supports other clients like OkHttp, RestTemplate, etc, separate dependencies are required. 
- the `.contract(new SpringMvcContract())` will tell Feign to parse `SpringMVC` interfaces. So it will understand annotations like `@RequestMapping`, `@PathVariable`, `@RequestBody`, etc. This is ideal because we don't need to change default SpringMVC implementation in the server microservice.
- `.encoder(new JacksonEncoder())` and `.decoder(new JacksonDecoder())` will will serialize/deserialize the payload
- `.target(ResourceApi.class, microservice1Url);` will tell Feign which SpringMVC class to parse and what url host to use.

Now let's see this `ResourceApi` in action by writing a test:

```java
@RunWith(SpringRunner.class)
@SpringBootTest
public class ResourceClientConfigTest {

    @Autowired
    private ResourceApi resourceApi;

    @Test
    public void getResourceApi() {
        ResourceDto resourceDto = new ResourceDto(1, "data1");

        resourceApi.createResource(resourceDto);

        List<ResourceDto> requestedResourceDtos = resourceApi.getResources();

        assertEquals(resourceDto, requestedResourceDtos.get(0));
        assertEquals(resourceDto.getData(), requestedResourceDtos.get(0).getData());
    }
}
```

This will do requests to the other microservice to create and retrieve resources. Ideally it is not good practice to allow your tests to do network calls, in production apps please mock any external call.


That is about it. We have a server microservice that didn't need editing and a client microservice that can read the interface from server. The dependency is versioned using semantic versioning. Also consider that this is not solving all communication architectures in big distributed systems. If the system is relying too much on these direct communications, a message broker might be easier to maintain.  

---

In a future post I will show how to use Java 9 modularity and put the API in a separate module so we don't need to pass around the whole JAR.

I hope this was educational.

Happy coding!