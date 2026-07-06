from supabase_rest import select_rows

def main():
    print("Querying via Supabase REST client...")
    try:
        users = select_rows("users", select="id,username,user_type")
        trainers = select_rows("trainers", select="id,username,trainer_name")
        programs = select_rows("programs", select="id,name,validity")
        quals = select_rows("trainer_qualifications", select="id,trainer_id,program_id")
        
        print(f"REST counts: users={len(users)}, trainers={len(trainers)}, programs={len(programs)}, qualifications={len(quals)}")
        print("\nUsers:")
        for u in users:
            print(f"  - {u}")
        print("\nTrainers:")
        for t in trainers:
            print(f"  - {t}")
        print("\nPrograms:")
        for p in programs:
            print(f"  - {p}")
        print("\nQualifications:")
        for q in quals:
            print(f"  - {q}")
            
    except Exception as e:
        print(f"Error querying via REST: {e}")

if __name__ == "__main__":
    main()
