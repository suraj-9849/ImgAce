// This is the Phase-2 where we perform necessary operations(using SHARP package!) and then store it in the TransformedBucket
import {
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
    GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import Sharp, { FormatEnum } from "sharp";

const s3 = new S3Client();
const S3_ORIGINAL_IMAGE_BUCKET = process.env.originialImageBucket!;
const S3_TRANSFORMED_IMAGE_BUCKET = process.env.transformedImageBucket!;

const ALLOWED_FORMATS: Record<string, string> = {
    jpeg: "image/jpg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
};


interface userOptions {
    width?: string;
    height?: string;
    grayscale?: string;
    rotate?: string;
    flip?: string;
    format?: keyof FormatEnum; // from sharp package(see the index.d.ts)
    quality?: string;
}

interface awsLambda {
    requestContext: {
        http: {
            method: string;
            path: string;
        };
    };
}

export const handler = async (event: awsLambda) => {
    // Check whether it is Get request or not!
    if (event.requestContext?.http?.method !== "GET") {
        return { statusCode: 403, body: "Method Not Allowed" };
    }

    const pathParts = event.requestContext.http.path.split("/");
    const operations = pathParts.pop(); // Image transformations (e.g., format=jpeg,width=100)
    const imagePath = pathParts.slice(2).join("/"); // Remove leading slashes

    try {
        // Fetching/Getting original image from aws-S3
        const originalImage: GetObjectCommandOutput = await s3.send(
            new GetObjectCommand({
                Bucket: S3_ORIGINAL_IMAGE_BUCKET,
                Key: imagePath,
            })
        );
        const imageBuffer = await originalImage.Body?.transformToByteArray();
        if (!imageBuffer) throw new Error("Image not found");

        // Parse transformation options:
        // because my url is in the form of /images/sample.jpg/format=webp,width=300,grayscale=true so I will split based on the , and  = inorder to get the values!
        const options: userOptions = Object.fromEntries(
            operations?.split(",").map((op) => op.split("=")) || []
        );

        // Initialize Sharp instance
        let sharpImage = Sharp(imageBuffer, { failOn: "none", animated: true });

        // applying the transformations based on the queryParameters using sharp package!:
        if(options.width==undefined || options.height== undefined ) return;
        if (options.width || options.height) {
            if(parseInt(options.width)<0 || parseInt(options.height) <0) return;
            sharpImage = sharpImage.resize({
                width: options.width ? parseInt(options.width) : 100,
                height: options.height ? parseInt(options.height) : 100,
            });
        }

        if (options.grayscale === "true") {
            sharpImage = sharpImage.grayscale();
        }

        if (options.rotate) {
            sharpImage = sharpImage.rotate(parseInt(options.rotate));
        }

        if (options.flip === "true") {
            sharpImage = sharpImage.flip();
        }


        // Handle format and quality
        let contentType = originalImage.ContentType || "image/jpeg";
        if (options.format && ALLOWED_FORMATS[options.format]) {
            contentType = ALLOWED_FORMATS[options.format];
            sharpImage = sharpImage.toFormat(options.format, {
                quality: options.quality ? parseInt(options.quality) : undefined,
            });
        }

        const transformedBuffer = await sharpImage.toBuffer();

        //save the transformed image to S3
        if (S3_TRANSFORMED_IMAGE_BUCKET) {
            await s3.send(
                new PutObjectCommand({
                    Bucket: S3_TRANSFORMED_IMAGE_BUCKET,
                    Key: `${imagePath}/${operations}`,
                    Body: transformedBuffer,
                    ContentType: contentType,
                })
            );
        }

        return {
            statusCode: 200,
            body: transformedBuffer.toString("base64"),
            isBase64Encoded: true,
            headers: {
                "Content-Type": contentType,
            },
        };
    } catch (error) {
        console.error("Error processing image:", error);
        return { statusCode: 500, body: "Internal Server Error" };
    }
};
