
class ValidationError(Exception):
    def __init__(self, msg, path):
        self.msg = msg
        self.path = path

    def __str__(self):
        return 'at path {}: {}'.format(self.path, self.msg)


def float_validator(data, path):
    try:
        return float(data)
    except (OverflowError, ValueError):
        raise ValidationError('expected float', path)


def string_validator(data, path):
    try:
        return str(data)
    except ValueError:
        raise ValidationError('expected string', path)


def blank_value_validator(data, path):
    if data is not None:
        raise ValidationError('expected blank value', path)
    return None


def dict_validator(value_validator):
    def validate(data, path):
        if not isinstance(data, dict):
            raise ValidationError('expected dict', path)
        return {k: value_validator(v, path + (k,)) for k, v in data.items()}
    return validate


def array_validator(value_validator):
    def validate(data, path):
        if not isinstance(data, list):
            raise ValidationError('expected list', path)
        return [
            value_validator(e, path + (i,))
            for i, e in enumerate(data)
        ]
    return validate


def record_validator(constructor, validators_dict):
    def validate(data, path):
        if not isinstance(data, dict):
            raise ValidationError('expected dict', path)
        if validators_dict.keys() != data.keys():
            raise ValidationError('expected keys {}'.format(validators_dict.keys()), path)
        return constructor(**{
            k: validate(data[k], path + (k,))
            for k, validate in validators_dict.items()
        })
    return validate


def union_validator(union_options):
    def validate(data, path):
        if not isinstance(data, dict):
            raise ValidationError('expected dict', path)
        if {'type', 'data'} != data.keys():
            raise ValidationError('expected keys \{\'type\', \'data\'\}', path)
        if data['type'] not in union_options.keys():
            raise ValidationError('\'type\' must be one of {}'.format(union_options.keys()), path)
        return union_options[data['type']](data['data'], path + ('data',))
    return validate
