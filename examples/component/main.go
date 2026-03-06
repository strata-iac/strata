package main

import (
	"fmt"

	"github.com/pulumi/pulumi-random/sdk/v4/go/random"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// Exercises: component URN hierarchy in state, parent field tracking,
// nested resource relationships, component lifecycle.

type Database struct {
	pulumi.ResourceState

	Name     pulumi.StringOutput `pulumi:"name"`
	Password pulumi.StringOutput `pulumi:"password"`
}

func NewDatabase(ctx *pulumi.Context, name string, opts ...pulumi.ResourceOption) (*Database, error) {
	db := &Database{}
	err := ctx.RegisterComponentResource("custom:database:Database", name, db, opts...)
	if err != nil {
		return nil, err
	}

	nameRes, err := random.NewRandomPet(ctx, name+"-name", &random.RandomPetArgs{
		Length:    pulumi.Int(2),
		Separator: pulumi.String("-"),
	}, pulumi.Parent(db))
	if err != nil {
		return nil, err
	}

	passRes, err := random.NewRandomPassword(ctx, name+"-password", &random.RandomPasswordArgs{
		Length:  pulumi.Int(24),
		Special: pulumi.Bool(true),
	}, pulumi.Parent(db))
	if err != nil {
		return nil, err
	}

	db.Name = nameRes.ID().ToStringOutput()
	db.Password = passRes.Result

	if err := ctx.RegisterResourceOutputs(db, pulumi.Map{
		"name":     nameRes.ID(),
		"password": passRes.Result,
	}); err != nil {
		return nil, err
	}

	return db, nil
}

type Service struct {
	pulumi.ResourceState

	Endpoint pulumi.StringOutput `pulumi:"endpoint"`
}

func NewService(ctx *pulumi.Context, name string, db *Database, opts ...pulumi.ResourceOption) (*Service, error) {
	svc := &Service{}
	err := ctx.RegisterComponentResource("custom:app:Service", name, svc, opts...)
	if err != nil {
		return nil, err
	}

	// Child resource that depends on the database component.
	endpoint, err := random.NewRandomId(ctx, name+"-endpoint", &random.RandomIdArgs{
		ByteLength: pulumi.Int(8),
	}, pulumi.Parent(svc), pulumi.DependsOn([]pulumi.Resource{db}))
	if err != nil {
		return nil, err
	}

	svc.Endpoint = endpoint.Hex

	if err := ctx.RegisterResourceOutputs(svc, pulumi.Map{
		"endpoint": endpoint.Hex,
	}); err != nil {
		return nil, err
	}

	return svc, nil
}

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		// Two-level component hierarchy: Service → Database → leaf resources.
		databases := make([]*Database, 3)
		for i := range 3 {
			var err error
			databases[i], err = NewDatabase(ctx, fmt.Sprintf("db-%d", i))
			if err != nil {
				return err
			}
		}

		// Services depend on databases — cross-component deps.
		for i := range 2 {
			svc, err := NewService(ctx, fmt.Sprintf("svc-%d", i), databases[i])
			if err != nil {
				return err
			}
			ctx.Export(fmt.Sprintf("svc%dEndpoint", i), svc.Endpoint)
		}

		for i, db := range databases {
			ctx.Export(fmt.Sprintf("db%dName", i), db.Name)
		}

		return nil
	})
}
