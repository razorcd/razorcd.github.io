---
layout: post
title: Anti Corruption Layer Architecture Pattern
---


I see this architectural pattern being underrated and I think it needs to be used more often. Systems are shifting more and more towards microservices architectures and also at the application level we want to gain modularity and decoupling. Especially for services that are not under our control. Putting a boundary between our business and any other dependencies would ensure better future evolvability.

If this pattern sounds new to you don't worry, if you are into writing loosely coupled code like me then you probably been using it already. I remembered about this architectural patters after reading this great book, called [Building Evolutionary Architectures](https://www.thoughtworks.com/books/building-evolutionary-architectures){:target="_blank"}. I also encountered this pattern in the past when I was reading about Domain Driven Design but I kind of lost touch of it.

To build applications we use different web frameworks which integrate with our business logic. Requests call web services that call our business code, the domains we use in the business are represented in the web endpoints, the web framework calls our services and our services call the web framework. So the business logic is bound to the web framework and we can live with that by constantly updating the framework to latest versions, fixing breaking changes and implementing the better features it offers. But when it comes to other libraries like a http client, message queues, other IO operations, etc we want to avoid integrating it directly in our application business. Putting another layer between these 2 parts would avoid any issues where changes to other libraries require changes in multiple places in our business code. At the microservices level it is the same situation, calling an external system should go trough a separate layer of decoupling too. This distraction layer is the Anti Corruption layer and offers an abstraction of the external dependency it integrates.

The Anti Corruption layer should consist of at least a Facade class but ideally it should also hold an Adapter that would handle customization of the library to your needs.

```
                                       Anti Corruption Layer  
 ____________________________       ______________________________       ___________________
|                            |     |                              |     |                   |
|Business Code / Microservice|---->|-Interface---Adapter---Facade-|---->|External dependency|
|____________________________|     |______________________________|     |___________________|

```


Every time I add a new open source library to my project I always check it's latest activity on github. If the library has no new commits for a few years or it has too many open issues, I am very reluctant to integrate it in my code base. But sometimes it happens that it is the only tool I can find to do the job. To avoid coupling the application to a dodgy library, I put an Anti Corruption layer between them. This way any future action on the library will not need any change inside the business logic, so it remains pristine. Also future developers that will work on same codebase will appreciate this decoupling.


#### Anti Corruption layer in action

Imagine that you are importing a library called `UnitConverter` that you definatelly need inside your business code. This made up library would work something like the one below. Note that this is intentionally made simple to keep explanation simple.

```java
    UnitConverter unitConverter = new UnitConverter();

    unitConverter.setStandard(UnitStandards.ISO);
    unitConverter.setConvertionDate(LocalDate.now());
    unitConverter.dataSource(bloomberg);

    Unit newUnit = unitConverter.convertCurrency(new BigDecimal(100.00), CurrencyType.GBP).to(CurrencyType.EUR);

    newUnit.setInflationRate(1.5);

    Map<String, BigDecimal> indexByMonth = UnitConverter.calculateIndex(newUnit, IndexPeriod.MONTH);

    if (allPositive(indexByMonth.getValues)) {
        indexByMonth.setInterest(3.5);
    } else {
        indexByMonth.setInterest(5);
    }

    // and so on
}
```

And you need to use all these `UnitConverter` methods inside you business code. Some more made up business code could look like this:

```java
    // in CustomerService:
    public void enrichCustomer(Customer customer, BigDecimal loanAmount) {
        Unit loanUnit = unitConverter.convertCurrency(loanAmount, customer.getDefaultCurrency()).to(systemCurrency);
        creditService.createNewLoan(customer, loanUnit, new Period(12, PeriodUnit.YEAR));
        indexService.adjust(loanUnit);
    }
    // ...

    // in IndexService:
    public void adjust(Unit unit) {
        unit.setInflationRate(currentInflationRate);
        Map<String, BigDecimal> indexByMonth = UnitConverter.calculateIndex(unit, IndexPeriod.MONTH);
        indexByMonth.getKeys().forEach(key -> mainIndex.get(key) = calculateAverage(mainIndex.get(key), indexByMonth.get(key));
    }
```

Notice that the `UnitConverter` direct calls are all over your business methods. Imagine this evolving to the entire codebase. When the `UnitConverter` will require some changes, it would require to search all over the codebase to find any implementation and inspect the change. Also unit testing will require some knowledge of the `UnitConverter` inner implementation. For example when mocking these external calls we need to ensure the returned object reflects the real implementation.

We want to make this easier to use, to get rid of repetitive usage of `UnitConverter` calls, to block access to some `UnitConverter's` methods that just aren't needed for your application and to provide a cleaner interface for testing/mocking.

So we start building an Anti Corruption layer.

First we make sure that our business code does not refer to `UnitConverter` directly. Ideally it would not even have access to this module, we could setup the system that it would fail at compile time if there is any direct use of `UnitConverter` in our business layer.

Then we create a dedicated layer/module that is the only one that would access our external dependency, the `UnitConverter`. this layer will be directly exposed to our business logic.

This new Anti Corruption layer code would be behind an interface that would look something like this:

```java
    interface LoanRegulator {
        static LoanRegulator INSTANCE(dataSource, date);
        BigDecimal convertCurrency(BigDecimal amount, Currency from, Currency to);
        Map<String, BigDecimal> indexCalculator(BigDecimal amount, double inflationRate, int daysInterval);
        ///...
    }
```    

Behind this `LoanRegulator` interface, the implementation will call the `UnitConverter` external library. And as a result, our main business code would inject only the `LoanRegulator` implementation. Something like the following:

```java
    // in constructor
    LoanRegulator loanRegulator = LoanRegulator.INSTANCE(bloomberg, LocalDate.now());

    // in CustomerService:
    public void enrichCustomer(Customer customer, BigDecimal loanAmount) {
        BigDecimal localAmount = loanRegulator.convertCurrency(loanAmount, customer.getDefaultCurrency(), systemCurrency);
        creditService.createNewLoan(customer, localAmount, new Period(12, PeriodUnit.YEAR));
        indexService.adjust(localAmount);
    }
    // ...

    // in IndexService:
    public void adjust(BigDecimal amount) {
        unit.setInflationRate(currentInflationRate);
        Map<String, BigDecimal> indexByMonth = loanRegulator.indexCalculator(amount, 1.5, 12);
        indexByMonth.getKeys().forEach(key -> mainIndex.get(key) = calculateAverage(mainIndex.get(key), indexByMonth.get(key));
    }
```

No class from the `UnitConverter`'s package is present in our business code. Not even the `Unit` class. We have our own representations of the units we need in our code. Any future change of `UnitConverter` code is now isolated in the Anti Corruption layer. Even replacing the entire `UnitConverter` library would require change only in this new layer. The interface that is provided for our business code will not change, so implicitly our business code does not need change either.

Note the `Map<String, BigDecimal> indexByMonth` it still keeps the same format that comes from UnitConverter. Ideally we would create a separate domain object for this and put a mapper inside the Anti Corruption layer that would map the internal `UnitConverter` index response to our business index response. Since these are only using standard Java classes it can be done later when changes are required in the new layer.

Now the business code is clean and corruption free.

#### Other use cases

Applications that deal with external source of data like remote http calls or a database, use the Anti Corruption layer to translate `to` and `from` that implementation to your own application's one.

If you have a `monolith` that you are trying to extract logic from into microservices, but these microservices still need to call the old monolith create a layer between the two parts. The microservice should only communicate with the anti corruption interface. this layer can be put in the microservice or in a separate service or even inside the old monolith. It is a design decision based on what is more convenient for the entire system.

Your business is relying on the anti corruption layer. Ensuring a robust and scalable implementation is important. To `avoid having a corrupt Anti Corruption` layer invest in designing this layer properly, define it's clear intentions and build unit tests around it. Ensure that the layer's interface is reflecting the business needs. This layer is different from the Adapter, Facade and Proxy layer, in a sense that the anti corruption layer is improving quality and protects against the underlying external dependency. On the other hand, the Adapter, Facade and Proxy layer only adapt external implementations to your needs. The anti corruption layer would be a higher abstraction that works at the domains level and uses these design patterns that work at class level.


## Conclusion

An anti corruption layer is mapping one domain to another external one so implementations that needs to use the external domain do not have to be corrupted by ambiguous implementations of the second domain. A clean anti corruption interface is important here and it should not change in future. The SOLID principles apply to this layer as much as to any other layer. It encourages the developers to think about the business needs and not about the syntax that needs to change, or in other words it encourages evolvability.

---

Happy coding!