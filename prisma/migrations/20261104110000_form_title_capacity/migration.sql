-- Match the API's existing 255-character title limit without truncating data.
ALTER TABLE `Form` MODIFY `title` VARCHAR(255) NOT NULL;
