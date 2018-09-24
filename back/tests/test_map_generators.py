from unittest import TestCase

from map_generators import SquareMapGenerator


class SquareMapGeneratorTestCase(TestCase):
    def test_for_smoke(self):
        SquareMapGenerator(
            x=5, y=5, distance=25,
            production=20, throughput=1,
        ).generate()
