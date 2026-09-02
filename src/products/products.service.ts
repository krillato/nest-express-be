import { Injectable, NotFoundException } from "@nestjs/common";
import { Product } from "./product.entity.js";
import { CreateProductDto } from "./dto/create-product.dto.js";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class ProductsService {

    constructor(
        @InjectRepository(Product) private readonly repo: Repository<Product>,
    ) {}


    findAll(){
        return this.repo.find()
    }

    async findOne(id:number):Promise<Product>{
        const product= await this.repo.findOneBy({ id })
        if(!product) throw new NotFoundException(`Product ${id} not found`)
        return product
    }

    create(dto:CreateProductDto){
        return this.repo.save(this.repo.create(dto))
    }

    async setImageUrl(id:number, imageUrl:string){
        const product = await this.findOne(id)
        product.imageUrl = imageUrl
        return this.repo.save(product)
    }
}
