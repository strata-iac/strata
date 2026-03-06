package stacks

import "errors"

var (
	ErrStackNotFound      = errors.New("stack not found")
	ErrStackAlreadyExists = errors.New("stack already exists")
	ErrStackHasResources  = errors.New("stack still contains resources")
)
