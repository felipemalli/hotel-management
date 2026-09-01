"""`EncryptedCharField`: cifra na escrita, decifra na leitura (SPEC 2.1)."""

from hotel.crypto import fernet
from hotel.fields import EncryptedCharField

field = EncryptedCharField()


def test_get_prep_value_encrypts():
    stored = field.get_prep_value("123.456.789-01")

    assert stored != "123.456.789-01"
    assert fernet().decrypt(stored.encode()).decode() == "123.456.789-01"


def test_from_db_value_decrypts():
    stored = field.get_prep_value("(21) 98888-7777")

    assert field.from_db_value(stored, None, None) == "(21) 98888-7777"


def test_none_passes_through_untouched():
    assert field.get_prep_value(None) is None
    assert field.from_db_value(None, None, None) is None
