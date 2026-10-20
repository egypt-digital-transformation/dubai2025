import qrcode
import csv
import os
from pathlib import Path

def create_vcard(name, position, country, email, phone, linkedin):
    """
    Create a vCard format string for contact information (vCard 3.0)
    This format is universally supported by smartphones
    """
    vcard = f"""BEGIN:VCARD
VERSION:3.0
FN:{name}
TITLE:{position}
EMAIL:{email}
TEL;TYPE=WORK,VOICE:{phone}
URL:{linkedin}
ADR;TYPE=WORK:;;;;;;{country}
END:VCARD"""
    return vcard

def generate_qr_code(vcard_data, filename, output_folder='qr_codes'):
    """
    Generate a QR code from vCard data and save it as an image
    """
    Path(output_folder).mkdir(parents=True, exist_ok=True)
    
    # Create QR code with optimal settings for vCard
    qr = qrcode.QRCode(
        version=None,  # Auto-determine size
        error_correction=qrcode.constants.ERROR_CORRECT_M,  # Medium correction for better scanning
        box_size=10,
        border=4,
    )
    
    qr.add_data(vcard_data)
    qr.make(fit=True)
    
    # Create and save image
    img = qr.make_image(fill_color="black", back_color="white")
    filepath = os.path.join(output_folder, f"{filename}.png")
    img.save(filepath)
    print(f"✓ Generated: {filepath}")
    
    return filepath

def process_csv(csv_file, output_folder='qr_codes'):
    """
    Read CSV file and generate QR codes for each person
    Expected CSV columns: Name, Position, Country, Email, Phone, LinkedIn
    """
    try:
        with open(csv_file, 'r', encoding='utf-8') as file:
            csv_reader = csv.DictReader(file)
            
            count = 0
            for row in csv_reader:
                # Extract and clean data
                name = row.get('Name', '').strip()
                position = row.get('Position', '').strip()
                country = row.get('Country', '').strip()
                email = row.get('Email', '').strip()
                phone = row.get('Phone', '').strip()
                linkedin = row.get('LinkedIn', '').strip()
                
                # Skip empty rows
                if not name:
                    continue
                
                # Create vCard
                vcard = create_vcard(name, position, country, email, phone, linkedin)
                
                # Generate safe filename
                safe_filename = "".join(c for c in name if c.isalnum() or c in (' ', '-', '_')).strip()
                safe_filename = safe_filename.replace(' ', '_')
                
                # Generate QR code
                generate_qr_code(vcard, safe_filename, output_folder)
                count += 1
            
            print(f"\n{'='*50}")
            print(f"✓ SUCCESS: Generated {count} QR business cards!")
            print(f"📁 Location: '{output_folder}' folder")
            print(f"{'='*50}")
            print("\n📱 To test: Scan any QR code with your phone's camera")
            print("   It should prompt you to save the contact automatically!")
            
    except FileNotFoundError:
        print(f"❌ Error: CSV file '{csv_file}' not found!")
    except Exception as e:
        print(f"❌ Error processing CSV: {str(e)}")

if __name__ == "__main__":
    print("="*50)
    print("QR BUSINESS CARD GENERATOR")
    print("="*50)
    print("\nGenerate QR codes from an existing CSV file.")
    
    output_folder = input("Output folder name [default: qr_codes]: ").strip() or "qr_codes"
    csv_file = input("Enter CSV filename: ").strip()
    if not csv_file:
        raise SystemExit("No CSV filename provided.")

    print(f"\n{'='*50}\n")
    process_csv(csv_file, output_folder)