---
layout: post
title: Big O Notation and Time Complexity (Javascript)
---

Time complexity measures the performance evolvability of an algorithm. It describes how an algorithm's performance will scale based on scaling the inputs (or some external factor) or in other words, how will the processing time of the algorithm grow if we grow the input values or data quantity (like: increasing the integer values that represents some form of quantity, increasing the size of an array / string, etc). Instead of comparing the input and execution time, we can compare the input and the number of operations the algorithm has to execute. This is very useful when comparing algorithms.

It is not describing how fast an algorithm will run (like measured in ms) because that would depend too much on external factors like CPU, memory, etc. 

For example if we have the next function that prints all the numbers from `1` until an input value `n`:

```javascript
function printNumbers(n) {
    for (int i=1; i<=n; i++) {
        console.log(n);
    }
}
```

How will the performance change if we increase the value `n`? 
- printNumbers(1) -> took 5ms   (does 1 for loop)
- printNumbers(2) -> took 10ms  (does 2 for loops)
- printNumbers(3) -> took 15ms  (does 3 for loops)
- printNumbers(4) -> took 20ms  (does 4 for loops)
- ...

We can notice that the input `n` and the execution time are proportional. The same comparison can be done between the input `n` and the number of operations the algorithm has to perform, in our case the `for loops`. So we can say that this algorithm has a `linear time complexity`.

Instead of naming time complexity as linear, constant, etc, the `Big O` notations are used which are described below.


## Common time complexities 

Here are the most common time complexities that we should know, in order of efficiency:

 - O(1) (constant): the number of operations for the algorithm does not change when input grows.
 - O(log n) (logarithmic complexity): the number of operations are reduced by a factor after each step. Like by growing the input 10 times, we will do only 3 more operations to execute the entire algorithm.
 - O(n) (linear): both input and number of operations increases by the same factor (they remain proportional).
 - O(n**2) (quadratic): increasing input `n` times results in `n to the power of 2` more operations.
 - O(n**3), O(n**4), etc (polynomial): increasing input `n` times results in `n to the power of 3, 4, etc` more operations.
 - O(2**n): (exponential): growing the input `n` times will result in performing `2 to the power of n` more operations.
 - O(n!): (factorial): growing the input `n` times will result in performing `n!` more operations.

Here are some exact number of operations to compare these common time complexities:

|Big-O   | input size 10 | input size 100 |
|:-------|:-------------:|:--------------:|
|O(1)    |  1            | 1              |
|O(log n)|  ~4           | ~7             |
|O(n)	 |  10           | 100            |
|O(n**2) | 100           | 10000          | 
|O(2**n) | 1024          | 2^100          |
|O(n!)	 | 3628800       | 100!           |

A graph comparing the efficiency:

![Time Complexity](/assets/posts/timecomplexity/time_complexity_graph.png)

(image source: [wikipedia](http://www.wikipedia.com))

## Functions examples by Big O

#### O(1)

O(1) means that no matter how large the input is, the number of operations are the same, they run in constant time.

Examples:

- checking the size of the array.
- using a constant-size lookup table or hash table.

```javascript
function getLastElement(array) {
    return array[array.length-1];
}
```

#### O(log n)

An algorithm which cuts the problem in half for each operation. Runs in logarithmic time, the operation will take longer as the input size increases, but once the input gets large, it will not perform operations for all inputs. If you double n, you have to spend an extra amount of time t to complete the task. If n doubles again, t won’t double, but will increase by a smaller amount.

Examples:
- binary search
- divide and conquer algorithms

```javascript
function binarySearch(sortedArray, current, start, end) {
    var middle = (start + end) / 2;
    if (end < start) { return -1; }
    if (current == sortedArray[middle]) {
        return middle;
    } else if (current < sortedArray[middle]) {
        return binarySearch(sortedArray, current, start, middle - 1);
    } else {
        return binarySearch(sortedArray, current, middle + 1, end);
    }
}
```

#### O(n)

Input value or elements quantity are proportional to the number of operations that need to perform. This is linear time, the larger the input, the longer it takes, in a constant tradeoff. Every time you double n, the operation will take twice as long.

Examples:
- iterate over a list

```javascript
function findAll(number, array) {
for (int i = 0; i < array.length; i++) {
        if (array[i]==number) {
            console.log("Found element " + number + " on position " + i);
        }
    }
```


#### O(n log n)

For each operation it also performs other `log n` operations. It runs in logarithmic linear time, increasing the input quantity will slow things down, but it is still feasible. Every time n is doubled, the time spent is a little more then double. It is efficient when needed to iterate over an array and then iterate again only on a gradually decreasing smaller part of the array.

Examples:
- quicksort, merge sort
- find duplicates in an array

```javascript
function merge(left, right) {
    var merged  = left.slice(0);
    right.forEach(function(element) {
        var i = merged.length - 1;
        var m = false;
        for (; i >= 0; i--) {
            if (merged[i] <= element) {
                merged.splice(i+1, 0, element);
                m = true;
                break;
            }
        }
        if (!m) {
            merged.unshift(element);    
        }
    });
    return merged;
};

function mergesort(elements) {
    if (elements.length <= 1) {
        return elements;
    }
    var middle = Math.ceil(elements.length/2);
    var left   = [];
    var right  = [];
    for (var i=0; i < elements.length; i++) {
        if (i < middle) {
            left.push(elements[i]);
        } else {
            right.push(elements[i]);
        }
    }
    left  = mergesort(left);
    right = mergesort(right);
    return merge(left, right);
};
```

#### O(n2)

For `n` operations it performs another `n` operations. Algorithm runs in quadratic time, it is partially feasible. Every time n is doubled, the operation will take four times as long.

Examples:
- bubble sort

```javascript
function hasDuplicates(array) {}
    var i = 0;
    while (i < array.size) {
        j = i + 1;
        while (j < array.size) {
            if (array[i] == array[j]) return true;
            j++;
        }
        i++;
    }
    return false
}
```

#### O(2**n)

The number of operations will double with each increase of input. Runs in exponential time, the operation is not feasible for bigger input quantity.

Examples:

```javascript
function fibonacci(number) {
    if (number <= 1) return number;
    return fibonacci(number - 2) + fibonacci(number - 1);
}
```

#### O(n!)

This is usually the case when looking for all possible permutations of `n` elements. Runs in factorial time, the operation is not feasible for bigger input quantity.

Examples:

- traveling a horse on a chess table while trying all routes
- retrieving all possible random groupings of elements from an array

```javascript
function combinations(array) {
    var fn = function(n, src, got, all) {
        if (n == 0) {
        if (got.length > 0) {
            all[all.length] = got;
        }
        return;
        }
        for (var j = 0; j < src.length; j++) {
        fn(n - 1, src.slice(j + 1), got.concat([src[j]]), all);
        }
        return;
    }
    
    var all = [];
    for (var i=0; i < a.length; i++) {
        fn(i, array, [], all);
    }
    all.push(array);
    return all;
}
```

## Other

[Big O performance of common functions of different collections](http://bigocheatsheet.com/)