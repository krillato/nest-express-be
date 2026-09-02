import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ProductsService } from "./products.service.js";
import { CreateProductDto } from "./dto/create-product.dto.js";
import { ApiKeyGuard } from "../common/guards/api-key.guard.js";

@Controller('products')
export class ProductsController {
    constructor(private readonly productsService: ProductsService) {}

    @Get()
    findAll() {
        return this.productsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string){// แปลง string param → number อัตโนมัติ ก่อนถึง handler เลย
        return this.productsService.findOne(Number(id));
    }
    
    @Post()
    @UseGuards(ApiKeyGuard)   // ต้องมี x-api-key header ที่ถูกต้อง
    create(@Body() dto: CreateProductDto){ // ต้องมี x-api-key header ที่ถูกต้อง
        return this.productsService.create(dto);
    }
}
