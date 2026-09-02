import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column('decimal')
  price: number;

  @Column({ nullable: true })
  imageUrl?: string; // เก็บ URL รูปจาก S3 — เติมทีหลังตอนอัปโหลดสำเร็จ
}
