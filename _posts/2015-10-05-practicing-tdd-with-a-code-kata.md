---
layout: post
title: Practicing TDD with a Java code kata
---

In this post I will explain the workflow of doing TDD while solving a coding challenge. While following the TDD workflow we will intentionally head in the wrong direction at some point and we will see how we can easily refactor while having confidence in our tests.
To stay original I chose a challenge that I didn't find anywhere. And that is because the the educational system from Eastern Europe (ex Sovietic Block) was different from other places. It is also a good coding challenge to give developers doing a coding interview.

## Describing the logic

To write mathematical equations we used 3 types of parenthesis: `(), [], {}` and these were always hierarchical like this: `{ [ ( ) ] }`, always in this order. And to go even further we would reuse the curly braces like this `{ { { [ ( ) ] } } }`. It's like [Matryoshka doll](https://en.wikipedia.org/wiki/Matryoshka_doll) from Russia. :)

An example would be: `{(4 + 1) * { 5 * [( 5 ^ 2 - 4 ^ 2 ) * 2 ]}} / 2`. (where `5^2` means 5 to the power of 2).

## Describing the challenge

We need an application that would take a mathematical equation as string for input and return a boolean response representing the validity of the parenthesis ordering.

Some valid equations for which the application would return `true`:
    - `5 * 5`
    - `(4 + 1) * 2`
    - `(4 + 1) * [(2 - 4) / (2 + 2)]`
    - `{(4 + 1) * { 5 * [( 5 ^ 2 - 4 ^ 2 ) * 2 ]}} / 2`

Some invalid equations for which the application would return `false`:
    - `(4 + 1) * 2)`
    - `[4 + 1] * 2`
    - `4 * ([2 - 4] / [2 + 2])`
    - `4 * {(2 - 4) / (2 + 2)}`
    - `([4 * [1 + 2] - 1])`


## Describing the TDD workflow

The TDD way of developing software is by splitting the implementation is small repetitive cycles. We start by defining the first cycle as the simplest implementation that we can get running. To implement a cycle we follow 3 steps: we write the test that covers the current cycle and see this test failing (RED), we write the implementation for this cycle and we see the test passing (GREEN), then we can improve the code with the confidence that the tests will keep the code robust (REFACTOR). 
It was tested that by following this practice we can design solid code, forces us to keep things decoupled and ensures better features testing coverage (testing both happy paths and sad paths).

## Show me the code

For this exercise we will be using Java 8 and JUnit 4.
Let's start by defining the first cycle. What is the simplest logic that can be implemented.

#### Cycle 1

At this stage if you want something to get you started you can just write a test that checks if the `Equation` class is defined. The test will fail at compile time so you can just define en empty class and see the tests green. At least you know that the whole system is working and ready for some logic. 

I will skip this part and start by directly implementing logic. Simplest scenario would be to pass an empty string and expect it to be valid.
Let's first write the test for that.

```java
    @Test
    public void shouldCheckEmptyString(){
        assertTrue("Should validate empty string equation.", new Equation("").isValid());
    }
```

This test fails because there is no `Equation` class, no String constructor and no `isValid()` instance method. Let's build all that.

```java
public class Equation {
    public Equation(String input) {
    }
    
    public boolean isValid() {
        return true;
    }
}
```

Now the tests pass. notice that we did nothing with the `input` constructor argument. We didn't have too and that is fine.

#### Cycle 2

Now we test against an equation that has no parenthesis.

Test first:

```java
    @Test
    public void shouldCheckEquationWithNoParenthesis() {
        assertTrue("Should validate equation with no parenthesis.", new Equation("5 * 5").isValid());
    }
```

Running test will succeed so we don't need to work on implementation. Don't think of any edge cases or other feature, you ain't going to need it (YAGNI), just focus on the test.

#### Cycle 3

Next we can test against an equation with one parenthesis.

```java
    @Test
    public void shouldCheckEquationWithOneOpenParenthesis() {
        assertFalse("Should invalidate equation with one open parenthesis.", new Equation("2 * (2 + 1").isValid());
    }
```

We expect this test to fail and it does. 

```java
java.lang.AssertionError: Should invalidate equation with one open parenthesis.
```

Let's write simplest implementation.

```java
public class Equation {
    private String input;

    public Equation(String input) {
        this.input = input;
    }

    public boolean isValid() {
        return !input.contains("(");
    }
}
```

Now we needed to store the state of input so we can check against it. And it is enough to check that it does not have a `(`. Don't think too far, YAGNI - remember? Who said programming is hard, we are just going with the TDD flow.

#### Cycle 4

Next let's test against an equation that has open and closed parenthesis.

```java
    @Test
    public void shouldCheckEquationWithOneOpenAndOneClosedParenthesis() {
        assertTrue("Should validate equation with one open and one close parenthesis.", new Equation("2 * (2 + 1)").isValid());
    }
```

As expected, it fails:

```java
java.lang.AssertionError: Should validate equation with one open and one close parenthesis.
```

Simplest implementation:

```java
    public boolean isValid() {
        return !input.contains("(") && !input.contains(")") ||
                input.contains("(") && input.contains(")") ;
    }
```

It either contains none or both open and close parenthesis.

#### Cycle 5

Next let's test agains an equation that has 2 open parenthesis and one closed parenthesis.

```java
    @Test
    public void shouldCheckEquationWithTwoOpenAndOneClosedParenthesis() {
        assertFalse("Should invalidate equation with two open and one close parenthesis.", new Equation("(2 * (2 + 1)").isValid());
    }
```

Test fail as expected:

```java
java.lang.AssertionError: Should invalidate equation with two open and one close parenthesis.
```

Let's refactor to make test pass.

```java
    public boolean isValid() {
        return input.chars().filter(c -> c == '(').count() == input.chars().filter(c -> c == ')').count();
    }
```

All tests pass. This logic checks that the occurrences count of open parenthesis and closed parenthesis is the same. Java version 8 is needed for this line to be compiled.

#### Cycle 6

Now let's check against multiple open and closed parenthesis that are in order.

```java
    @Test
    public void shouldCheckEquationWithMultipleInOrderOpenAndClosedRoundParenthesis() {
        assertTrue("Should validate equation with multiple in order open and close round parenthesis.",
                new Equation("(2 + 5) * (2 + 1)").isValid());
    }
```    

It passes also. Great.

We have beet taken "nano steps" and this is TDD at it's best. This ensures we cover every scenario wile we slowly write tests for each logic. It is too tedious though, so I suggest we speed it up a little to so called "second steps". Finding a good balance between each steps complexity and speed is the key to being productive for short term and log term too.

#### Cycle 7

Now let's add the square braces.

```java
    @Test
    public void shouldCheckEquationWithMultipleInOrderOpenAndClosedRoundAndSquareParenthesis() {
        assertTrue("Should validate equation with multiple in order open and close round and square parenthesis.",
                new Equation("[(2 + 5) * (2 + 1)] * 2").isValid());
    }
```

And tests also pass. Because square braces are ignored in our logic. Great.

#### Cycle 8

Now let's add only one square brace and expect it to fail.

```java
    @Test
    public void shouldCheckEquationWithOneOpenSquareAndMultipleInOrderOpenAndClosedRoundParenthesis() {
        assertFalse("Should validate equation with one square brace and multiple in order open and close round parenthesis.",
                new Equation("[(2 + 5) * (2 + 1) * 2").isValid());
    }
```

This one fails, excelent. Let's compare the counts of open and closed square parenthesis also.

```java
    public boolean isValid() {
        return input.chars().filter(c -> c == '(').count() == input.chars().filter(c -> c == ')').count() &&
               input.chars().filter(c -> c == '[').count() == input.chars().filter(c -> c == ']').count();
    }
```

So simple. We can do the same with curly braces too.    

#### Cycle 9

Let's test against open and closed curly braces too.

```java
    @Test
    public void shouldCheckEquationWithMultipleInOrderOpenAndClosedRoundAndSquareAndCurlyParenthesis() {
        assertTrue("Should validate equation with multiple in order open and close round, square and curly parenthesis.",
                new Equation("{[(2 + 5) * (2 + 1)] * 2 + 1} * 3").isValid());
    }
```

Tests pass because we ignore curly braces. So moving on.


#### Cycle 10

Let's test against one open curly brace.


```java
    @Test
    public void shouldCheckEquationWithOneOpenCurlyAndMultipleInOrderOpenAndClosedRoundAndSquareParenthesis() {
        assertFalse("Should validate equation with one open curly and multiple in order open and close round, square parenthesis.",
                new Equation("{[(2 + 5) * (2 + 1)] * 2 + 1 * 3").isValid());
    }
```

Fails on this assertion so let's implement the curly braces count comparison too.


```java
    public boolean isValid() {
        return input.chars().filter(c -> c == '(').count() == input.chars().filter(c -> c == ')').count() &&
               input.chars().filter(c -> c == '[').count() == input.chars().filter(c -> c == ']').count() &&
               input.chars().filter(c -> c == '{').count() == input.chars().filter(c -> c == '}').count();
    }
```    

All tests are green.

-----

So many tests for only a few lines of code. This is because the tests are more and more specific while our code is more and more generic. If performance is an issue then feel free to refactor, the tests got you covered. Our time complexity is `O(n)` so we can leave it as it is. Also in the test equations we only need the parenthesis; all the operations and numbers can be removed but I prefer to leave them because they communicate better to other developers (including future me).

-----

#### Cycle 11

Next we should check against the hierarchy of the parenthesis. For example `"{([2 + 5] / 2) * 2} * 3"` Should fail because `{([` are in wrong order.

Let's write some assertion to cover a few possibilities.


```java
    @Test
    public void shouldCheckEquationWithMultipleHierarchicalOpenAndClosedRoundAndSquareAndCurlyParenthesisWithMultipleInnerParenthesis() {
        assertTrue("Should validate equation with multiple hierarchical open and close round, square and curly parenthesis where there are multiple different inner parenthesis groups (1).",
                new Equation("{(4 + 1) * { 5 * [( 5 ^ 2 - 4 ^ 2 ) * 2 ]}} / 2").isValid());
        assertTrue("Should validate equation with multiple hierarchical open and close round, square and curly parenthesis where there are multiple different inner parenthesis groups (2).",
                new Equation("{[(2 + 5) * 2] + 1} * (2 + 1) * {[(2 + 5) * 2] + 1} * 2").isValid());
        assertTrue("Should validate equation with multiple hierarchical open and close round, square and curly parenthesis and with multiple root curly braces.",
                new Equation("{[(2 + 5) * 2] + 1} * (2 + 1) * {[(2 + 5) * 2] + 1} / {[(2 + 5) * 2] + 1} * (2 + 1) * {[(2 + 5) * 2] + 1} * 2").isValid());
        assertTrue("Should validate equation with multiple hierarchical open and close round, square and curly parenthesis and with multiple root curly braces.",
                new Equation("{\{[(2 + 5) * 2] + 1} * (2 + 1) * {[(2 + 5) * 2] + 1} / {[(2 + 5) * 2] + 1} * (2 + 1) * {[(2 + 5) * 2] + 1} * 2} / 5").isValid());
    }

    @Test
    public void shouldCheckEquationWithMultipleHierarchicalOpenAndClosedSquareAndCurlyParenthesisWithoutInnerRoundParenthesis() {
        assertFalse("Should invalidate equation with multiple hierarchical open and close square and curly parenthesis without inner round parenthesis.",
                new Equation("{[2 + 5] * 2} * 3").isValid());
    }

    @Test
    public void shouldCheckEquationWithWrongHierarchicalOrderOfOpenAndClosedSquareAndCurlyAndRoundParenthesis() {
        assertFalse("Should invalidate equation with wrong hierarchical order of open and closed square, curly and round parenthesis.",
                new Equation("{([2 + 5] / 2) * 2} * 3").isValid());
    }

    @Test
    public void shouldCheckEquationWithMultipleNotHierarchicalOpenAndClosedRoundAndSquareAndCurlyParenthesis() {
        assertFalse("Should invalidate equation with multiple NOT hierarchical open and close round, square and curly parenthesis (1).",
                new Equation("[({2 + 5} * (2 + 1)) * 2 + 1] * 3").isValid());
        assertFalse("Should invalidate equation with multiple NOT hierarchical open and close round, square and curly parenthesis (2).",
                new Equation("{2 * (2 + 1)} * 3").isValid());
        assertFalse("Should invalidate equation with multiple NOT hierarchical open and close round, square and curly parenthesis (3).",
                new Equation("{[2 + 5] * 2} * 3 / (3 - 1)").isValid());
        assertFalse("Should invalidate equation with multiple NOT hierarchical open and close round, square and curly parenthesis (4).",
                new Equation("[{2 + 5} * (2 + 1) * {2 + 1}] * 2").isValid());
        assertFalse("Should invalidate equation with multiple NOT hierarchical open and close round, square and curly parenthesis (5).",
            new Equation("{\{[(2 + 5) * 2] + 1} * (2 + 1) * {[(2 + 5) * 2] + 1} / {[(2 + 5) * 2] + 1} * (2 + 1) * {[2 + 5 * 2] + 1} * 2} / 5").isValid());
    }
```

It is a big step but it's ok because we are testing only one feature and we want to cover all good and bad hierarchical scenarios.
These tests are failing nicely so let's implement the check for parenthesis hierarchy.

We can no longer keep the logic we have. This step requires a different direction. We need to redesign our parsing logic. Looking at these examples I see a pattern that can be transposed into a tree data structure with nodes that have multiple branches.

For example this valid equation could be transposed to the following graph.

`{[(2 + 5) * (2 + 1)] * 2} * [(3 + 1) / 2] / (4 + 2)`

```
                root
          _______|_______
         |       |       |
        { }     [ ]     ( )
         |       |
        [ ]     ( )
      ___|___
     |       |
    ( )     ( )
```

Each brace will be a node in our tree. During the parsing we will keep a `currentNode` as state of progress and on each iteration we either add a new `childNode`, either close the `currentNode`. 

All our past tests will remain valid and they gradually cover most scenarios so on our code refactoring we can should already have some confidence.

Let's start by defining the nodes a a separate class.


```java
public class Node {
    /**
     * Contains a map of open and corresponding closing braces.
     */
    protected static final Map<Character, Character> OPEN_CLOSE_BRACES = new HashMap<>();

    /**
     * Each brace should have a weight.
     * Starting from most inner brace until most exterior brace they should be weighted in order with a step of 1.
     */
    private static final Map<Character, Integer> WEIGHT = new HashMap<>();

    /**
     * The minimum weight of the braces.
     */
    private static final int MIN_WEIGHT;

    /**
     * The maximum weight of the braces.
     */
    private static final int MAX_WEIGHT;

    /*
     * Braces configuration.
     */
    static {
        OPEN_CLOSE_BRACES.put('(', ')');
        OPEN_CLOSE_BRACES.put('[', ']');
        OPEN_CLOSE_BRACES.put('{', '}');

        WEIGHT.put('(', 1);
        WEIGHT.put('[', 2);
        WEIGHT.put('{', 3);

        MIN_WEIGHT = WEIGHT.values().stream().min(Integer::compareTo).orElseThrow(IllegalArgumentException::new);
        MAX_WEIGHT = WEIGHT.values().stream().max(Integer::compareTo).orElseThrow(IllegalArgumentException::new);
    }

    /**
     * It is the starting node that does not contain any value.
     */
    private boolean isRoot;

    /**
     * The opening or closing brace of current node.
     */
    private Character value;
    private Node parent;
    private List<Node> children;
//    private boolean isClosed; // YAGNI

    public Node() {
        isRoot = false;
        children = new ArrayList<>();
    }

    public Node(Character value) {
        this();
        this.value = value;
    }

    public Node(boolean isRoot) {
        this();
        this.isRoot = isRoot;
    }

    public Node(Character value, Node parent) {
        this();
        this.value = value;
        this.parent = parent;
    }

    /**
     * Checks if current node contains a value of an opening brace.
     *
     * @return [boolean]
     */
    public boolean isOpenBrace() {
        return OPEN_CLOSE_BRACES.containsKey(value);
    }

    /**
     * Checks if current node contains a value of an closing brace.
     *
     * @return [boolean]
     */
    public boolean isClosedBrace() {
        return OPEN_CLOSE_BRACES.containsValue(value);
    }

    /**
     * Checks if node can hierarchically be a subnode of current node.
     *
     * @param node the new node
     * @return [boolean]
     */
    public boolean canContain(Node node) {
        return isRoot() || (getWeight() > node.getWeight()) || (getWeight()==MAX_WEIGHT && node.getWeight()==MAX_WEIGHT);
    }

    /**
     * If current node is root node.
     *
     * @return [boolean]
     */
    public boolean isRoot() {
        return isRoot;
    }

    /**
     * Checks if current node can be closed with specified node.
     *
     * @param closingNode the node to close current node with
     * @return [boolean]
     */
    public boolean isCloseableWith(Node closingNode) {
        return OPEN_CLOSE_BRACES.get(value).equals(closingNode.getValue());
    }

    /**
     * Checks if current node is hierarchically complete. If it's the lowest weighted or has any direct hierarchical subbraces.
     *
     * @return [boolean]
     */
    public boolean isHierarchicallyComplete() {
        return (getWeight()==MIN_WEIGHT) || hasAnyHierarchicalSubBrace();
    }

    /**
     * Checks if current node has any direct hierarchical subbraces.
     *
     * @return [boolean]
     */
    private boolean hasAnyHierarchicalSubBrace() {
        return  getChildren().stream().anyMatch(childNode -> (childNode.getWeight()+1==getWeight()) || (childNode.getWeight()==MAX_WEIGHT && getWeight()==MAX_WEIGHT));
    }

    // getters and setters

    // equals and hashCode

    // toString
}
```

I documented all the functions so nothing else to add here.

Moving on to the new `Equation` class.


```java
public class Equation {
    private String input;

    /**
     * Constructor to set an equation as a string. E.g. "{[(2 + 5) * (2 + 1)] * 2 + 1} * 3"
     * @param input the equation.
     */
    public Equation(String input) {
        this.input = input;
    }

    /**
     * Checks if the hierarchy of the parenthesis is valid.
     * Validity rules:
     *   - contains only `(), [], {}` braces
     *   - all open braces are also closed
     *   - hierarchy of braces is in the following order: `{ [ ( ) ] }` or `{ { { [ ( ) ] } } }`
     *
     * @return [boolean] if equation parenthesis are valid.
     */
    public boolean isValid() {
        Node root = new Node(true);

        try {
            return input.chars()
                    .filter(c -> Node.OPEN_CLOSE_BRACES.containsKey((char)c) || Node.OPEN_CLOSE_BRACES.containsValue((char)c))
                    .mapToObj(v -> new Node((char) v))
                    .reduce(root, (currentNode, node) -> {
                        if (node.isOpenBrace()) {
                            if (currentNode.canContain(node)) {
                                node.setParent(currentNode);
                                currentNode.getChildren().add(node);
                                return node;
                            } else throw new BrokenEquationException(currentNode.getValue()+" can not contain subnode "+node.getValue());
                        } else { // else is close brace
                            if (currentNode.isCloseableWith(node) && currentNode.isHierarchicallyComplete())
                                return currentNode.getParent();
                            else throw new BrokenEquationException(currentNode.getValue()+" is not closeable with "+node.getValue()+" or node does not have any hierarchical sub brace.");
                        }
                    }).isRoot();
        } catch (BrokenEquationException ex) {
            return false;
        }

    }

    public class BrokenEquationException extends RuntimeException {
        public BrokenEquationException() {
            super();
        }
        public BrokenEquationException(String message) {
            super(message);
        }
    }
}
```

The parser will go over all the braces and follow `currentNode`. Once a brace is closed it will jump to it's parent as `currentNode`. This means that at the end, on a valid equation, we should end up back at root node.

For adding a new node as child of `currentNode` we perform some validations between the two nodes.
 - if `currentNode` is root then it can receive any new node as child
 - if weight of `currentNode` is bigger then the inner child node
 - or if both nodes have the `MAX_WEIGHT` then they can continue having children forever

For closing a brace we first check if it's the matching closing brace of `currentNode`. Then with `isHierarchicallyComplete()` we validate the `currentNode` by checking if subnodes are direct descendents:
 - it is a brace with minimal weigth
 - has at least one subbrace with weight that is 1 step lower
 - or if `currentNode` hax max weight and has at least one child that has also max weight
If closing a brace is successful we just jump to it's parent as `currentNode`.

If any of the validations fail we jump out of the reducer by throwing an exception that is cached later. If this is idea it's debatable and I will leave it for another post.

## Evolving the code

I just realized this code is easily expandable. We can add extra braces and all we need to change is the configuration. Let me show you by adding a new brace `< >` that will be most outer in an ecuation. So hierarchy will be `<{[()]}>`.

I am starting with a test case:

```java
    @Test
    public void shouldCheckEquationWithExtraBraces() {
        assertTrue("Should validate equation with extra braces.",
                new Equation("<{[(2 + 5) * (2 + 1)] * 2} + 1> * 3").isValid());
    }
```    

Now in the `Node` configuration I will just add the brace to the `Map` and also to the weight `Map`. new braces config would look like this.

```java
    static {
        OPEN_CLOSE_BRACES.put('(', ')');
        OPEN_CLOSE_BRACES.put('[', ']');
        OPEN_CLOSE_BRACES.put('{', '}');
        OPEN_CLOSE_BRACES.put('<', '>');

        WEIGHT.put('(', 1);
        WEIGHT.put('[', 2);
        WEIGHT.put('{', 3);
        WEIGHT.put('<', 4);

    }
```

And by running this last test we will see it passing. So awesome!

Of course some other tests will fail now because the most outer brace changed and we can no longer have multiple nested curlybraces. (`{ { [ ( ) ] } }`).

----

This was a big one. I hope it was educational.

Happy coding.