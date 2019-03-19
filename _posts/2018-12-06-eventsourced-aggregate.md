---
layout: post
title: Event Sourced Aggregates
---

As of Domain Driven Design approach, an `aggregate` is a domain specific pattern for encapsulating a collection of entities that live on their own. The `aggregate` encapsulates all the behavior of internal parameters and is unique, being identifiable by an id. Changing the state of the aggregate is possible only through it's exposed domain specific methods. 
Because an `aggregate` needs to be persisted for a longer time, we should always save and load the entire object as a whole. By applying different `commands` to an aggregate, it always results in a new aggregate state that will overwrite any previous states. This means that we loose all history of the aggregate. Logging a message for each behavior taken would help with having a history of the aggregate but what if we want to see what was the state of the aggregate at a particular time in the past. Or if we want to implement new features and use all the past data to update the aggregate.

A better approach would be to generate `events` with every behavior taken on the `aggregate` and apply the events to the aggregate to change it's `state`. When we persist the aggregate, it is enough to save the events because we can reapply them to the aggregate again. If we want to see the state of the aggregate at a particular time in the past we apply only the events that happened up to that point in time. We have much more flexibility by relying on an event log to generate the aggregate. 

This would also map better to real life actions, the events being just facts that happened in the past. And as the past can not be changed, the events should not be ever changed too.


## Starting from a Rover domain model

Let's start from a simple Rover model that can move and turn on a 2d matrix. The Rover has an `id`, a `location` defined by longitude(N-S) and latitude (E-W) and an orientation (N,S,E,W). As behaviors we will have `moveForward`, `turnLeft` and `turnRight`. A rover is created by placing it on the matrix.

Here is the initial implementation of the Rover. Notice the 3 behaviors are mutating internal state of the object.

```java
@Data
public class Rover {
    private final String id;
    private Location location;
    private Orientation orientation;

    public Rover(String id, Location location, Orientation orientation) {
        this.id = id;
        this.location = location;
        this.orientation = orientation;
    }

    public void moveForward() {
        this.location = this.location.forward(orientation);
    }

    public void turnLeft() {
        this.orientation = this.orientation.left();
    }

    public void turnRight() {
        this.orientation = this.orientation.right();
    }

    @Value
    @AllArgsConstructor
    public static class Location {
        private final double latitude; //N-S
        private final double longitude; //E-W

        private Location forward(Orientation orientation) {
            switch (orientation) {
                case N:
                    return new Location(this.getLatitude()+1, this.getLongitude());
                case E:
                    return new Location(this.getLatitude()+0, this.getLongitude()+1);
                case S:
                    return new Location(this.getLatitude()-1, this.getLongitude()+0);
                case W:
                    return new Location(this.getLatitude()+0, this.getLongitude()-1);
            }
            throw new IllegalStateException("Unprocessable orientation "+orientation);
        }
    }

    @Value
    public static enum Orientation {
        N("W","E"),
        S("E","W"),
        E("N","S"),
        W("S","N");

        private String left;
        private String right;

        Orientation(String left, String right) {
            this.left = left;
            this.right = right;
        }

        public Orientation left() {
            return Orientation.valueOf(left);
        }

        public Orientation right() {
            return Orientation.valueOf(right);
        }
    }
}
```

The `Location#forward` method could have been simplified by moving the `latitude`, `longitude` additions (-1, +1) per orientation inside the `Orientation` class but I preferred to let the `Location` class dictate and have the `Orientation` class only for it's own purpose.


## Testing the Rover model

Testing this is simply simulating all possible behaviors. Here is an example of a test that checks multiple behaviors. We will see later a more convenient functional way of simulating this.

```java
    @Test
    public void moveAndTurnRoverMultipleTimes1() {
        RoverAggregate rover = new RoverAggregate("id-01", new RoverAggregate.Location(1,2), RoverAggregate.Orientation.W);

        rover.moveForward();  // 0,2 W
        rover.turnLeft(); // 0,2 S
        rover.moveForward(); // 0,1 S
        rover.turnRight(); // 0,1 W

        assertThat(rover).isEqualTo(new RoverAggregate("id-01", new RoverAggregate.Location(0,1), RoverAggregate.Orientation.W));
    }
```
The full unit tests for this initial `Rover` class can be found here: [RoverAggregateTest.java](https://github.com/razorcd/java-snippets-and-demo-projects/blob/master/eventsourcedaggregate/src/test/java/demo/stage2eventsourced/RoverAggregateTest.java){:target="_blank"}


## Adding a repository for this Rover model

The repository is straight forward. It will save and load the Rover by it's `id`. For simplicity we are using an in memory Map as storage.

```java
public class RoverRepository {

    private static final Map<String, Rover> storage = new HashMap<String, Rover>();

    public void save(Rover rover) {
        storage.put(rover.getId(), rover);
    }

    public Rover findById(String id) {
        return storage.get(id);
    }
}
```

Notice that on every change, the `save` method is overwriting the previous state of the Rover.

The unit tests for the `RoverRepository` can be found here: [RoverRepositoryTest.java](https://github.com/razorcd/java-snippets-and-demo-projects/blob/master/eventsourcedaggregate/src/test/java/demo/stage2eventsourced/RoverRepositoryTest.java){:target="_blank"}


## Transforming the model into an event sourced aggregate

In this part we will introduce internal events for changing the state of the Rover. For each behavior of the Rover we will emit an internal event that will be applied to the same object and apply changes. And instead of persisting the Rover, we will save only the events that generated the current state of the Rover.

```java
@Data
public class RoverAggregate {
    private String id;
    private Location location;
    private Orientation orientation;

    public RoverAggregate(String id, Location location, Orientation orientation) {
        this.apply(new RoverCreatedEvent(id,location,orientation));
    }

    public void moveForward() {
        this.apply(new MovedForwardEvent());
    }

    public void turnLeft() {
        this.apply(new TurnedLeftEvent());
    }

    public void turnRight() {
        this.apply(new TurnedRightEvent());
    }


    public void apply(RoverCreatedEvent roverCreatedEvent) {
        this.id = roverCreatedEvent.getId();
        this.location = roverCreatedEvent.getLocation();
        this.orientation = roverCreatedEvent.getOrientation();
    }

    public void apply(MovedForwardEvent movedForwardEvent) {
        this.location = this.location.forward(orientation);
    }

    public void apply(TurnedLeftEvent turnedLeftEvent) {
        this.orientation = this.orientation.left();
    }

    public void apply(TurnedRightEvent turnedRightEvent) {
        this.orientation = this.orientation.right();
    }
}
```

Now all we have to do is hold these events in the aggregate so when saving it we will only persist the events.
We will add a temporary events list to the aggregate to store all new events until persisted:
`private List<DomainEvent> newEvents = new ArrayList<>();`.

Applying an event to the aggregate will modify the aggregate's state and temporary hold the event. We will also return the aggregate for each `apply` method to be able to chain multiple calls. Another option would be to generate new Aggregates for every event instead of mutating the current one.
For example the `RoverCreatedEvent` `apply` method would look like this:

```java
public RoverAggregate apply(RoverCreatedEvent roverCreatedEvent) {
    this.id = roverCreatedEvent.getId();
    this.location = roverCreatedEvent.getLocation();
    this.orientation = roverCreatedEvent.getOrientation();

    newEvents.add(roverCreatedEvent);
    return this;
}
```    

The `events` are simple serializable data objects that define a `type` and also a `timestamp`. We can use the `timestamp` for recreating an aggregate at a particular point in time.

Here is example of the `RoverCreatedEvent`:

```java
@Getter
@EqualsAndHashCode
@ToString
public abstract class DomainEvent {
    private String type = this.getClass().getName();
    private Instant createdAt = Instant.now();
}

@Value
@RequiredArgsConstructor
public class RoverCreatedEvent extends DomainEvent implements Serializable {
    private final String id;
    private final RoverAggregate.Location location;
    private final RoverAggregate.Orientation orientation;
}
...
```

The implementations for the other event objects can be found here: [DomainEvents](https://github.com/razorcd/java-snippets-and-demo-projects/tree/master/eventsourcedaggregate/src/main/java/demo/stage2eventsourced){:target="_blank"}

We will also need a method where we apply more general `DomainEvents` type and do the pattern matching inside the aggregate. This way we can store events as `DomainEvents` and hide the conversion inside the aggregate.

Here is the final implementation of the `RoverAggregate`:

```java
@Data
@EqualsAndHashCode(exclude = "newEvents")
public class RoverAggregate {
    private String id;
    private Location location;
    private Orientation orientation;

    // represent events that were applied since last persistence of the aggregate
    private List<DomainEvent> newEvents = new ArrayList<>();

    public RoverAggregate() {
    }

    public RoverAggregate(String id, Location location, Orientation orientation) {
        this.apply(new RoverCreatedEvent(id,location,orientation));
    }

    public void moveForward() {
        this.apply(new MovedForwardEvent());
    }

    public void turnLeft() {
        this.apply(new TurnedLeftEvent());
    }

    public void turnRight() {
        this.apply(new TurnedRightEvent());
    }


    public RoverAggregate apply(RoverCreatedEvent roverCreatedEvent) {
        this.id = roverCreatedEvent.getId();
        this.location = roverCreatedEvent.getLocation();
        this.orientation = roverCreatedEvent.getOrientation();

        newEvents.add(roverCreatedEvent);
        return this;
    }

    public RoverAggregate apply(MovedForwardEvent movedForwardEvent) {
        this.location = this.location.forward(orientation);

        newEvents.add(movedForwardEvent);
        return this;
    }

    public RoverAggregate apply(TurnedLeftEvent turnedLeftEvent) {
        this.orientation = this.orientation.left();

        newEvents.add(turnedLeftEvent);
        return this;
    }

    public RoverAggregate apply(TurnedRightEvent turnedRightEvent) {
        this.orientation = this.orientation.right();

        newEvents.add(turnedRightEvent);
        return this;
    }

    public RoverAggregate apply(DomainEvent domainEvent) {
        switch (domainEvent.getType()) {
            case "demo.stage2eventsourced.RoverCreatedEvent":
                return this.apply((RoverCreatedEvent) domainEvent);
            case "demo.stage2eventsourced.MovedForwardEvent":
                return this.apply((MovedForwardEvent) domainEvent);
            case "demo.stage2eventsourced.TurnedLeftEvent":
                return this.apply((TurnedLeftEvent) domainEvent);
            case "demo.stage2eventsourced.TurnedRightEvent":
                return this.apply((TurnedRightEvent) domainEvent);
        }
        throw new IllegalStateException("Unprocessable DomainEvent "+domainEvent);
    }

    // used for removing temporary events after persistence 
    public void clearNewEvents() {
        newEvents.clear();
    }
}
```

All previous tests cases should be still valid. We did not change any of the publicly exposed behaviors.


## Functional approach for applying the events

Now we have the pattern matching `apply(DomainEvent domainEvent)` method that returns the modified aggregate. We can use this to apply a stream of events to the aggregate using a `reducer` resulting in a `RoverAggregate` that will have the last state. The reducer will take each event, one by one in order and apply it to a new `RoverAggregate`. This functional approach is also called as `leftFold`. 

```java
Stream<DomainEvent> eventStream = Stream.of(
        new RoverCreatedEvent("id-01", new RoverAggregate.Location(1,2), RoverAggregate.Orientation.W),
        new MovedForwardEvent(),
        new TurnedLeftEvent(),
        new MovedForwardEvent(),
        new TurnedRightEvent());

RoverAggregate roverAggregate = eventStream.reduce(new RoverAggregate(), RoverAggregate::apply, (a, b)-> null);
```
Since we have only `reduce` in Java, we have to live with this side effect `(a, b)-> null` that should be ignored.


## Updating the repository to store only events and rebuild the Aggregate on load

For persisting the state of the aggregate we will just have to store the `DomainEvents` and with every new save append the new events to the already existing ones. This way we heep all the history and not loose any past data.

To load the aggregate we have to take all the events for that `id` and apply them to a new `RoverAggregate`. If we would like to create a `RoverAggregate` at a particular point in the past we can load only the events up to that time.

To keep it simple we will use just an in memory map here as storage (`private static final Map<String, List<DomainEvent>> storage = new HashMap<>();`) but ideally these events should be stored in an append only data store.

```java
public class RoverRepository {

    private static final Map<String, List<DomainEvent>> storage = new HashMap<>();

    public void save(RoverAggregate rover) {
        List<DomainEvent> domainEvents = storage.getOrDefault(rover.getId(), new ArrayList<>());
        domainEvents.addAll(rover.getNewEvents());
        rover.clearNewEvents();

        storage.put(rover.getId(), domainEvents);
    }

    public RoverAggregate findById(String id) {
        return storage.get(id)
                .stream()
                .reduce(new RoverAggregate(), RoverAggregate::apply, (a, b) -> null);
    }
}
```


## Conclusion

Storing the events instead of the final state (the projection of the events) is a much better way of keeping all the history of the behaviors. Any newly added feature can also rely on all past actions by replying all the events again. 

For example if we want to implement a new function to get the total distance a rover moved since it's beginning, we just have to implement a new property in the aggregate that will increment every time the `MovedForwardEvent` was applied. When reloading the aggregate from db it will update the `distance` value without need of any other changes.

It is indeed possible that the number of events applied to an aggregate grows to a very large number and loading it by applying each event would take a long time. Even if the old events are not relevant to us anymore, these are still needed to be able to reply everything from the beginning and keep current state consistent. An alternative solution would be to save a snapshot of the aggregate (let's say once a day) and on each new load from DB - start from the snapshotted aggregate and only apply the newer events.

The events in the store should not ever be changed. If a wrong behavior was executed (wrong event was generated) we will not remove the created event but instead we will create a new event that fixes the issue. This is very good for auditing since we guarantee 100% history of our past records. Even using physical drives that only allows writing data and not deleting/mutating would be a good solution.

To go more in depth in this topic check out the [Axon Framework](https://axoniq.io/){:target="_blank"} witch will offer support in building an event sourced system together with a CQRS approach and it is useful for learning the concept too.

---

The complete implementation of the aggregate can be found here: [event-sourced-aggregate](https://github.com/razorcd/java-snippets-and-demo-projects/tree/master/eventsourcedaggregate){:target="_blank"}

Thanks for reading.
