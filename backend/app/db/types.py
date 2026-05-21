"""Custom SQLAlchemy types for PostgreSQL native enum compatibility."""

from sqlalchemy import Enum as SAEnum, TypeDecorator


class PgEnum(TypeDecorator):
    """
    Bridges Python enums with PostgreSQL native enum types.

    PROBLEM:
      SQLAlchemy's Enum(PythonEnum) sends .name ("EMAIL") → PG rejects
      Using impl=String sends ::VARCHAR → PG can't compare enum = varchar

    SOLUTION:
      Use impl=SAEnum with the enum VALUES as strings.
      This makes asyncpg cast as ::otp_type (correct PG type).
      Override process_bind_param to send .value ("email").
      Override process_result_value to convert back to Python enum.

    USAGE:
        otp_type = Column(PgEnum(OTPTypeEnum, pg_type_name="otp_type"), ...)
    """
    impl = SAEnum
    cache_ok = True

    def __init__(self, enum_class, pg_type_name=None):
        self.enum_class = enum_class
        # Pass lowercase .value strings to SAEnum so PG type cast is correct
        super().__init__(
            *[e.value for e in enum_class],
            name=pg_type_name or enum_class.__name__.lower(),
            create_type=False,
        )

    def process_bind_param(self, value, dialect):
        """Python → DB: enum member → its .value string."""
        if value is None:
            return None
        if isinstance(value, self.enum_class):
            return value.value
        return str(value)

    def process_result_value(self, value, dialect):
        """DB → Python: string → enum member."""
        if value is None:
            return None
        try:
            return self.enum_class(value)
        except ValueError:
            return value
