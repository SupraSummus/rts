The pure, continous RTS
=======================

**Writing a game is in progress.** ETA: unknown

It'll be a "pure strategy game", web browser based. I aim to allow creating complex structures/stategies/processes from a set of elementary, simple rules:
 * one type of units
 * no resources (well, units themselves are a resource)
 * no infrastructure development (factories, supply extractors, etc)
 * terrain reduced to a graph

Also, I intend to make as many as possible quantities in this game continous:
 * time - the game will be a RTS
 * units - they are a gray fluid measured by floating point numbers
 * terrain - distances, production efficiency, unit capacities

To provide negitve feedback for large empires growth (the stronger you get the more difficult the game gets), I aim to introduce some rules:
 * units self decay (due to breakdowns/malfunction)
 * there is a limit on how many commands you can give in a period of time

How to run
----------

    pipenv install
    pipenv run python back/server.py

...and websocket should be listening on `localhost:8080`
