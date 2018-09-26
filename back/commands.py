from validators import (
    ValidationError,
    string_validator, float_validator,
    union_validator, dict_validator, record_validator, array_validator,
)


class GameUserError(Exception):
    pass


class Command:
    @staticmethod
    def validator():
        return union_validator({
            'map': MapRequest.validator(),
            'player': PlayerInfoRequest.validator(),
            'disposition': DispositionCommand.validator(),
        })

    @classmethod
    def from_user_data(cls, data):
        try:
            return cls.validator()(data, ())
        except ValidationError as e:
            raise GameUserError(e)

    def execute(self, game, player_id):
        raise NotImplementedError()


class MapRequest(Command):
    @classmethod
    def validator(cls):
        return record_validator(cls, {})

    def execute(self, game, player_id):
        game.send(player_id, 'map', game.terrain_data)


class PlayerInfoRequest(Command):
    @classmethod
    def validator(cls):
        return record_validator(cls, {
            'player_ids': array_validator(string_validator),
        })

    def __init__(self, player_ids):
        self.player_ids = player_ids

    def execute(self, game, player_id):
        game.send(player_id, 'player', {
            player_id: game.players[player_id].player_data
            for player_id in self.player_ids
            if player_id in game.players
        })


class DispositionCommand(Command):
    @classmethod
    def validator(cls):
        return record_validator(cls, {
            'node_id': string_validator,
            'disposition': Disposition.validator(),
        })

    def __init__(self, node_id, disposition):
        self.node_id = node_id
        self.disposition = disposition

    def execute(self, game, player_id):
        node = game.nodes[self.node_id]
        changed = node.set_disposition(player_id, self.disposition)
        game.needs_do_frame.update(changed)


class Disposition:
    @classmethod
    def validator(cls):
        return record_validator(Disposition, {
            'target': float_validator,
            'ratios': dict_validator(float_validator),
        })

    def __init__(self, target, ratios):
        self.target = target
        ratios_sum = sum(ratios.values())
        self.ratios = {k: v / ratios_sum for k, v in ratios.items()}
