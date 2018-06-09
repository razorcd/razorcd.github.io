---
layout: post
title: Investigating Java thread dumps
---


A thread is just a unit that is doing some processing. A java application runs on multiple threads that can be spawn up any particular time. Each thread has it's own stack trace bat all the threads in an application share the same heap. Once all threads are stopped, the application will exit. Working with threads can get very complicated and to be able to investigate our applications behavior it is important to be able to read through thread dumps.

Thread dumps from different implementations of the JVM have slightly different looking thread dumps. For this article I will be using the Oracle JVM with Java 1.8.0_151 and 16.04.1-Ubuntu operating system.

## The thread dump revealed

Let's start with what is a stacktrace. A `stacktrace` is a representation of all the method calls in order of execution that are not terminated yet. Every time a new method is called by a thread, it is added to the stack and once it finished executing it is removed from the stack. Methods on stack function as LIFO (last in - first out).

I have a simple example application that we will investigate it's thread dump:

```java
package demo;

public class Main {

    public static void main(String[] args) {
        System.out.println("main called.");

        Main main = new Main();
        main.baz();
        main.foo();
    }

    private void foo() {
        System.out.println("Foo called.");
        this.bar();
    }

    private void bar() {
        System.out.println("Bar called.");

        // LockSupport.park();        // will block execution of current thead. Thread state will be WAITING (parking)
        try {
            Thread.sleep(9999999);    // will block execution of current thread. Thread state will be TIMED_WAITING (sleeping)
        } catch (InterruptedException ex) {
            ex.printStackTrace();
        }
    }

    private void baz() {
        System.out.println("Baz called.");
    }
}
```

This application will run like this: 
`start main > start baz > exit baz > start foo > start bar > wait 9999999ms > exit bar > exit foo > exit main`. 
We will do a thread dump while the thread is in the wait 9999999ms mode.

Once this application is started we need to grab it's process id (PID). We can do that by calling the classic `ps aux` and filter it:

```shell
➜  public ps aux | grep -i [j]ava | grep -i demo.[M]ain
razor     6099  1.1  0.1 6984164 30224 ?       Sl   15:02   0:00 /bin/java -classpath /tmp/javaThreadDumps/out/production/HelloWorld demo.Main:...
```

The PID is 6099. Let's do a thread dump on this PID:

```shell
kill -3 6099
```

A thread dump is printed to the stdout of the application and we can see a few threads listed. One of this threads is our own Main executing thread. This is how it looks like:

```
"main" #1 prio=5 os_prio=0 tid=0x00007fd6d800b800 nid=0x17d4 waiting on condition [0x00007fd6e07a7000]
   java.lang.Thread.State: TIMED_WAITING (sleeping)
	at java.lang.Thread.sleep(Native Method)
	at demo.Main.bar(Main.java:23)
	at demo.Main.foo(Main.java:16)
	at demo.Main.main(Main.java:10)
``` 

Notice the stacktrace with the ordered of the still running methods. `baz` is not displayed because it exited already. Also the thread is in `TIMED_WAITING (sleeping)` state, meaning it is just waiting for those 9999999ms to pass.

What does these fields mean:
- `"main"` : is the human readable name of the thread.
- `#1` : is the ID of the thread set by the JVM.
- `prio=5` : is the JVM's priority of this thread.
- `os_prio=0` : is the operating system's priority of this thread.
- `tid=0x00007fd6d800b800` : thread address in memory.
- `nid=0x17d4` : the native ID of thread assigned by the operating system.
- `waiting on condition [0x00007fd6e07a7000]` : optional current action of the thread.

- `java.lang.Thread.State: TIMED_WAITING (sleeping)` : the current state of the thread. Should match the last action in the stacktrace. Available states: `NEW` (is starting), `RUNNABLE` (executes methods), `WAITING` (Object.wait(999)), `TIME_WAITING` (Thread.sleep(999)), `BLOCKED` (waiting for monitor), `TERMINATED` (is exiting).

Note that it could happen that a thread is in `RUNNABLE` state but be blocked by a lower level native invocation (JNI).

But how can we spot `thread stagnation` if we can not rely completely on the active thread state. A solution would be to create multiple thread dumps during the execution of the application and investigate the threads that don't modify their stacktrace. Also we could start by investigating cpu usage and IO usage to isolate the problem further.


## Simulating and investigating a deadlock

What is a deadlock? A `deadlock` is a situation where 2 or more threads are in a `BLOCKED` state and each thread is expecting the other thread to release the lock on a shared resource.


Here is a simple piece of code to simulate this:

```java
public class Main2 {
    public static void main(String[] args) {
        Main2 obj = new Main2();

        List<Integer> numList1 = Arrays.asList(1, 2, 3);
        List<Integer> numList2 = Arrays.asList(4, 5, 6);

        Thread thread1 = new Thread(() -> {
            synchronized (numList1) {
                obj.printValues(numList1);
                try { Thread.sleep(100); } catch (InterruptedException e) {e.printStackTrace();}
                synchronized (numList2) {   // thread1 will stop here because `numList2` is locked by thread2
                    obj.printValues(numList2);
                }
            }
        }, "thread1");

        Thread thread2 = new Thread(() -> {
            synchronized (numList2) {
                obj.printValues(numList2);
                try { Thread.sleep(100); } catch (InterruptedException e) {e.printStackTrace();}
                synchronized (numList1) {   // thread2 will stop here because `numList1` is locked by thread1
                    obj.printValues(numList1);
                }
            }
        }, "thread2");

        thread1.start();
        thread2.start();

        System.out.println(Thread.currentThread().getName() + " : " + "Main method exited.");
    }

    private void printValues(List<Integer> numList) {
        System.out.println(Thread.currentThread().getName() + " : " + numList);
    }
}
```


We have 2 objects `numList1` and `numList2` defined in the main thread. We define 2 threads:
- in `thread1` the `synchronized (numList1)` will try to lock `numList1`, then sleep for 100ms, then `synchronized (numList2)` will try to lock `numList2`.
 in `thread2` the `synchronized (numList2)` will try to lock `numList2`, then sleep for 100ms, then `synchronized (numList1)` will try to lock `numList1`.
 
 Of course only one thread can lock a synchronized object at a particular time. So after `thread1` locks `numList1` and `thread2` locks `numList2`, none of the 2 threads can lock another object. They are both waiting for each other to release the lock. Resulting in a `deadlock`.

And the thread dump is clear about it:

```
"thread2" #12 prio=5 os_prio=0 tid=0x00007f70443ba000 nid=0x42e7 waiting for monitor entry [0x00007f700440e000]
   java.lang.Thread.State: BLOCKED (on object monitor)
	at demo.Main2.lambda$main$1(Main2.java:32)
	- waiting to lock <0x000000076d91c998> (a java.util.Arrays$ArrayList)
	- locked <0x000000076d91c9d0> (a java.util.Arrays$ArrayList)
	at demo.Main2$$Lambda$2/1149319664.run(Unknown Source)
	at java.lang.Thread.run(Thread.java:748)

"thread1" #11 prio=5 os_prio=0 tid=0x00007f70443b8800 nid=0x42e6 waiting for monitor entry [0x00007f701c124000]
   java.lang.Thread.State: BLOCKED (on object monitor)
	at demo.Main2.lambda$main$0(Main2.java:22)
	- waiting to lock <0x000000076d91c9d0> (a java.util.Arrays$ArrayList)
	- locked <0x000000076d91c998> (a java.util.Arrays$ArrayList)
	at demo.Main2$$Lambda$1/1023892928.run(Unknown Source)
	at java.lang.Thread.run(Thread.java:748)
```

And lower in the thread dump we can see it explicitly recognized this cyclic lock:

```
Found one Java-level deadlock:
=============================
"thread2":
  waiting to lock monitor 0x00007f7000003828 (object 0x000000076d91c998, a java.util.Arrays$ArrayList),
  which is held by "thread1"
"thread1":
  waiting to lock monitor 0x00007f7000006168 (object 0x000000076d91c9d0, a java.util.Arrays$ArrayList),
  which is held by "thread2"

Java stack information for the threads listed above:
===================================================
"thread2":
	at demo.Main2.lambda$main$1(Main2.java:32)
	- waiting to lock <0x000000076d91c998> (a java.util.Arrays$ArrayList)
	- locked <0x000000076d91c9d0> (a java.util.Arrays$ArrayList)
	at demo.Main2$$Lambda$2/1149319664.run(Unknown Source)
	at java.lang.Thread.run(Thread.java:748)
"thread1":
	at demo.Main2.lambda$main$0(Main2.java:22)
	- waiting to lock <0x000000076d91c9d0> (a java.util.Arrays$ArrayList)
	- locked <0x000000076d91c998> (a java.util.Arrays$ArrayList)
	at demo.Main2$$Lambda$1/1023892928.run(Unknown Source)
	at java.lang.Thread.run(Thread.java:748)

Found 1 deadlock.
```

Both threads are stuck in `BLOCKED (on object monitor)` state. Notice the stacktrace, both threads locked one of the array objects and both threads are waiting for the other array object. A clear deadlock.


## Investigating thread CPU and memory consumption

I prepared an application that is using backtracking to calculate the Fibonacci value for values between 40 and 45. This will keep the thread busy to use the CPU at 100%. If you are coming from the future and have a more powerful CPU even on your mobile phone please increase this value.

```java
    public static void main(String[] args) {
        while (true) {
            int n = new Random().nextInt(5) + 40;
            System.out.println("fibonacci(" + n + ") = " + fibonacci(n));
        }
    }

    private static long fibonacci(int n) {
        if (n == 0 || n == 1) return n;
        return fibonacci(n-1) + fibonacci(n-2);
    }
```

Once running the coolers will spin up fast as CPU load is at 100%.

Find the ID of the running java process: `ps aux | grep -i [j]ava | grep -i demo.[M]ain` => found PID is 19824.

Then use Top tool to investigate each thread for this process: `top -p 19824 -d 15 -H` .

Let's see result:

```
➜  top -p 19824 -d 15 -H

top - 19:49:17 up  5:18,  1 user,  load average: 2,26, 2,54, 2,35
Threads:  21 total,   1 running,  20 sleeping,   0 stopped,   0 zombie
%Cpu(s): 13,3 us,  2,6 sy,  0,1 ni, 83,5 id,  0,4 wa,  0,0 hi,  0,2 si,  0,0 st
KiB Mem : 16239160 total,  6442024 free,  4795880 used,  5001256 buff/cache
KiB Swap:  7882748 total,  7882748 free,        0 used.  9006988 avail Mem 

PID USER      PR  NI    VIRT    RES    SHR S %CPU %MEM     TIME+ COMMAND
19833 razor     20   0 6984164  30588  17764 R 99,9  0,2   1:08.25 java
19824 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19835 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19836 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19837 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19838 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19839 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19840 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19841 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19842 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19846 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19848 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19849 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19857 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19859 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19860 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19861 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19862 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19863 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19864 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.00 java
19865 razor     20   0 6984164  30588  17764 S  0,0  0,2   0:00.02 java
```

We can see that thread with PID 19833 is consuming 100% of CPU. Let's do a thread dump and see what is this thread doing.

Do a thread dump on the main java process: `kill -3 19824`.

On the printed thread dump we can find the related thread by converting the `19833` to hex and matching it to the `nid` of the listed threads.

`19833` to hex is `4d79`.

Then in the thread dump list we can find the corresponding thread matching `nid=0x4d79`:

```
"main" #1 prio=5 os_prio=0 tid=0x00007f160000b800 nid=0x4d79 runnable [0x00007f1609ba0000]
   java.lang.Thread.State: RUNNABLE
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.fibonacci(Main3.java:20)
	at demo.Main3.main(Main3.java:14)
```

We found our thread that was running fibonacci functions intensely.


---

That is about it for thread dumps.

Happy coding.