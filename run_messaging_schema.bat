@echo off
echo Running messaging schema migration...
echo Please ensure PostgreSQL is running and you have the database rtc_human_resource created
echo.

REM Try to run the SQL script
psql -h localhost -U postgres -d rtc_human_resource -f messaging_schema.sql

if %ERRORLEVEL% EQU 0 (
    echo Migration completed successfully!
) else (
    echo Migration failed. Please check your PostgreSQL connection.
    echo You may need to run the messaging_schema.sql file manually in your PostgreSQL client.
)

pause
